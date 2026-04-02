/**
 * @module modules/auth/__tests__/auth.service.spec
 * @description
 * Unit tests for AuthService covering registration, login, OAuth, token
 * refresh, logout, and profile retrieval flows.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Queue } from 'bullmq';
import { UnauthorizedException } from '@nestjs/common';

import { AuthService } from '../auth.service';
import { AuthRepository } from '../auth.repository';
import { OAuthService } from '../strategies/oauth.strategy';
import { RedisService } from '../../../redis/redis.service';
import { QUEUES } from '../../../queues/queue-names';

import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';

import { User } from '../entities/user.entity';
import { EmailConflictException } from '../exceptions/email-conflict.exception';
import { InvalidProviderException } from '../exceptions/invalid-provider.exception';
import { SessionExpiredException } from '../exceptions/session-expired.exception';
import { TokenReuseException } from '../exceptions/token-reuse.exception';
import { TooManyAttemptsException } from '../exceptions/too-many-attempts.exception';
import { InvalidTopicsException } from '@common/exceptions/invalid-topics.exception';
import { InvalidCredentialsException } from '@common/exceptions/invalid-credentials.exception';
import { AccountNotActiveException } from '@common/exceptions/account-not-active.exception';
import { UsernameConflictException } from '@common/exceptions/username-conflict.exception';

import {
  AUTH_JWT,
  AUTH_TTL,
  AUTH_BCRYPT_ROUNDS,
  AUTH_MODULE_CONSTANTS,
} from '../auth.constants';

// Mock the hash utility
jest.mock('../../../common/utils/hash.util', () => ({
  hashValue: jest.fn().mockResolvedValue('$2b$12$mocked_hash'),
  compareHash: jest.fn().mockResolvedValue(true),
  DUMMY_HASH: '$2b$12$dummy_hash',
}));

import * as hashUtil from '../../../common/utils/hash.util';

describe('AuthService (Unit Tests)', () => {
  let service: AuthService;
  let authRepository: jest.Mocked<AuthRepository>;
  let oauthService: jest.Mocked<OAuthService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;
  let redisService: jest.Mocked<RedisService>;
  let notificationQueue: jest.Mocked<Queue>;
  let feedBuildQueue: jest.Mocked<Queue>;

  const mockUser: User = {
    id: '019501a0-0000-7000-8000-000000000001',
    email: 'test@example.com',
    password_hash: '$2b$12$hashed_password',
    username: 'testuser',
    avatar_url: null,
    bio: null,
    role: 'user',
    experience_level: 'novice',
    account_status: 'active',
    token_version: 0,
    total_xp: 0,
    token_balance: 0,
    current_streak: 0,
    longest_streak: 0,
    last_active_date: null,
    public_profile_token: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: AuthRepository,
          useValue: {
            existsByEmail: jest.fn(),
            existsByUsername: jest.fn(),
            validateTagIds: jest.fn(),
            createUserWithAffinity: jest.fn(),
            findByEmail: jest.fn(),
            findById: jest.fn(),
            findByOAuthProvider: jest.fn(),
            linkOAuthAccount: jest.fn(),
            createOAuthUser: jest.fn(),
            getLoginAttempts: jest.fn(),
            getLoginAttemptsTtl: jest.fn(),
            incrementLoginAttempts: jest.fn(),
            clearLoginAttempts: jest.fn(),
            getRefreshTokenHash: jest.fn(),
            rotateRefreshToken: jest.fn(),
            deleteRefreshToken: jest.fn(),
            revokeAllSessions: jest.fn(),
            incrementTokenVersion: jest.fn(),
            storeRefreshToken: jest.fn(),
          },
        },
        {
          provide: OAuthService,
          useValue: {
            exchangeCode: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            publish: jest.fn(),
          },
        },
        {
          provide: `BullQueue_${QUEUES.NOTIFICATION}`,
          useValue: {
            add: jest.fn(),
          },
        },
        {
          provide: `BullQueue_${QUEUES.FEED_BUILD}`,
          useValue: {
            add: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    authRepository = module.get(AuthRepository) as jest.Mocked<AuthRepository>;
    oauthService = module.get(OAuthService) as jest.Mocked<OAuthService>;
    jwtService = module.get(JwtService) as jest.Mocked<JwtService>;
    configService = module.get(ConfigService) as jest.Mocked<ConfigService>;
    redisService = module.get(RedisService) as jest.Mocked<RedisService>;
    notificationQueue = module.get(`BullQueue_${QUEUES.NOTIFICATION}`) as jest.Mocked<Queue>;
    feedBuildQueue = module.get(`BullQueue_${QUEUES.FEED_BUILD}`) as jest.Mocked<Queue>;

    // Set default config values
    configService.get.mockImplementation((key: string) => {
      const configMap: Record<string, string> = {
        [AUTH_JWT.PRIVATE_KEY_ENV]: 'private-key',
        [AUTH_JWT.PUBLIC_KEY_ENV]: 'public-key',
        [AUTH_JWT.REFRESH_SECRET_ENV]: 'refresh-secret',
        [AUTH_JWT.ACCESS_TTL_ENV]: String(AUTH_TTL.ACCESS_TOKEN_SECONDS),
        [AUTH_JWT.REFRESH_TTL_ENV]: String(AUTH_TTL.REFRESH_TOKEN_SECONDS),
      };
      return configMap[key];
    });

    // Reset mocks
    jest.clearAllMocks();
    (hashUtil.compareHash as jest.Mock).mockResolvedValue(true);
  });

  describe('register', () => {
    it('should successfully register a new user with valid data', async () => {
      const registerDto: RegisterDto = {
        email: 'newuser@example.com',
        password: 'P@ssw0rd!',
        username: 'newuser',
        experience_level: 'intermediate',
        topics: ['topic-1', 'topic-2'],
      };

      authRepository.existsByEmail.mockResolvedValue(false);
      authRepository.existsByUsername.mockResolvedValue(false);
      authRepository.validateTagIds.mockResolvedValue(['topic-1', 'topic-2']);
      authRepository.createUserWithAffinity.mockResolvedValue(mockUser);
      authRepository.storeRefreshToken.mockResolvedValue(undefined);
      jwtService.sign.mockReturnValueOnce('access-token').mockReturnValueOnce('refresh-token');

      const result = await service.register(registerDto);

      expect(result).toBeDefined();
      expect(result.user.email).toBe(mockUser.email);
      expect(result.access_token).toBe('access-token');
      expect(result.refresh_token).toBe('refresh-token');
      expect(authRepository.existsByEmail).toHaveBeenCalledWith(registerDto.email.toLowerCase());
      expect(authRepository.existsByUsername).toHaveBeenCalledWith(registerDto.username);
      expect(authRepository.validateTagIds).toHaveBeenCalledWith(registerDto.topics);
      expect(notificationQueue.add).toHaveBeenCalled();
      expect(feedBuildQueue.add).toHaveBeenCalled();
    });

    it('should throw EmailConflictException if email already exists', async () => {
      const registerDto: RegisterDto = {
        email: 'existing@example.com',
        password: 'P@ssw0rd!',
        username: 'newuser',
        experience_level: 'intermediate',
        topics: ['topic-1'],
      };

      authRepository.existsByEmail.mockResolvedValue(true);

      await expect(service.register(registerDto)).rejects.toThrow(EmailConflictException);
      expect(authRepository.existsByEmail).toHaveBeenCalled();
    });

    it('should throw UsernameConflictException if username already exists', async () => {
      const registerDto: RegisterDto = {
        email: 'new@example.com',
        password: 'P@ssw0rd!',
        username: 'existing',
        experience_level: 'intermediate',
        topics: ['topic-1'],
      };

      authRepository.existsByEmail.mockResolvedValue(false);
      authRepository.existsByUsername.mockResolvedValue(true);

      await expect(service.register(registerDto)).rejects.toThrow(UsernameConflictException);
      expect(authRepository.existsByUsername).toHaveBeenCalled();
    });

    it('should throw InvalidTopicsException if topics do not exist', async () => {
      const registerDto: RegisterDto = {
        email: 'new@example.com',
        password: 'P@ssw0rd!',
        username: 'newuser',
        experience_level: 'intermediate',
        topics: ['invalid-topic-1', 'invalid-topic-2'],
      };

      authRepository.existsByEmail.mockResolvedValue(false);
      authRepository.existsByUsername.mockResolvedValue(false);
      authRepository.validateTagIds.mockResolvedValue([]); // No valid topics

      await expect(service.register(registerDto)).rejects.toThrow(InvalidTopicsException);
    });
  });

  describe('login', () => {
    it('should successfully authenticate user with valid credentials', async () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'P@ssw0rd!',
      };

      authRepository.getLoginAttempts.mockResolvedValue(0);
      authRepository.findByEmail.mockResolvedValue(mockUser);
      authRepository.storeRefreshToken.mockResolvedValue(undefined);
      authRepository.clearLoginAttempts.mockResolvedValue(undefined);
      (hashUtil.compareHash as jest.Mock).mockResolvedValue(true);
      jwtService.sign.mockReturnValueOnce('access-token').mockReturnValueOnce('refresh-token');

      const result = await service.login(loginDto, '192.168.1.1');

      expect(result).toBeDefined();
      expect(result.user.email).toBe(mockUser.email);
      expect(authRepository.clearLoginAttempts).toHaveBeenCalledWith('192.168.1.1', loginDto.email);
      expect(redisService.publish).toHaveBeenCalledWith(
        AUTH_MODULE_CONSTANTS.TRANSACTIONAL_CHANNEL,
        expect.stringContaining(AUTH_MODULE_CONSTANTS.USER_LOGGED_IN),
      );
    });

    it('should throw TooManyAttemptsException when rate limit exceeded', async () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'P@ssw0rd!',
      };

      authRepository.getLoginAttempts.mockResolvedValue(5);
      authRepository.getLoginAttemptsTtl.mockResolvedValue(600);

      await expect(service.login(loginDto, '192.168.1.1')).rejects.toThrow(TooManyAttemptsException);
    });

    it('should throw InvalidCredentialsException for non-existent user', async () => {
      const loginDto: LoginDto = {
        email: 'nonexistent@example.com',
        password: 'P@ssw0rd!',
      };

      authRepository.getLoginAttempts.mockResolvedValue(0);
      authRepository.findByEmail.mockResolvedValue(null);
      authRepository.incrementLoginAttempts.mockResolvedValue(undefined);
      (hashUtil.compareHash as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto, '192.168.1.1')).rejects.toThrow(InvalidCredentialsException);
      expect(authRepository.incrementLoginAttempts).toHaveBeenCalled();
    });

    it('should throw AccountNotActiveException if account is not active', async () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'P@ssw0rd!',
      };

      const inactiveUser: User = { ...mockUser, account_status: 'suspended' };
      authRepository.getLoginAttempts.mockResolvedValue(0);
      authRepository.findByEmail.mockResolvedValue(inactiveUser);

      await expect(service.login(loginDto, '192.168.1.1')).rejects.toThrow(AccountNotActiveException);
    });

    it('should increment login attempts on invalid password', async () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'WrongPassword!',
      };

      authRepository.getLoginAttempts.mockResolvedValue(0);
      authRepository.findByEmail.mockResolvedValue(mockUser);
      authRepository.incrementLoginAttempts.mockResolvedValue(undefined);
      (hashUtil.compareHash as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto, '192.168.1.1')).rejects.toThrow(InvalidCredentialsException);
      expect(authRepository.incrementLoginAttempts).toHaveBeenCalledWith('192.168.1.1', loginDto.email);
    });
  });

  describe('oauthLogin', () => {
    it('should successfully login via OAuth with existing account', async () => {
      const profile = {
        provider_user_id: 'google-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: 'https://example.com/avatar.jpg',
      };

      oauthService.exchangeCode.mockResolvedValue(profile);
      authRepository.findByOAuthProvider.mockResolvedValue(mockUser);
      authRepository.storeRefreshToken.mockResolvedValue(undefined);
      jwtService.sign.mockReturnValueOnce('access-token').mockReturnValueOnce('refresh-token');

      const result = await service.oauthLogin('google', 'auth-code');

      expect(result).toBeDefined();
      expect(result.needs_onboarding).toBe(false);
      expect(authRepository.findByOAuthProvider).toHaveBeenCalledWith('google', profile.provider_user_id);
    });

    it('should link OAuth account to existing user by email', async () => {
      const profile = {
        provider_user_id: 'google-123',
        email: 'existing@example.com',
        name: 'Test User',
        avatar_url: null,
      };

      oauthService.exchangeCode.mockResolvedValue(profile);
      authRepository.findByOAuthProvider.mockResolvedValue(null);
      authRepository.findByEmail.mockResolvedValue(mockUser);
      authRepository.linkOAuthAccount.mockResolvedValue(undefined);
      authRepository.storeRefreshToken.mockResolvedValue(undefined);
      jwtService.sign.mockReturnValueOnce('access-token').mockReturnValueOnce('refresh-token');

      const result = await service.oauthLogin('google', 'auth-code');

      expect(result).toBeDefined();
      expect(authRepository.linkOAuthAccount).toHaveBeenCalledWith({
        userId: mockUser.id,
        provider: 'google',
        provider_user_id: profile.provider_user_id,
      });
    });

    it('should create new user for new OAuth account', async () => {
      const profile = {
        provider_user_id: 'github-456',
        email: 'newuser@example.com',
        name: 'New User',
        avatar_url: 'https://github.com/avatar.jpg',
      };

      const newUser: User = { ...mockUser, id: 'new-uuid', email: profile.email };

      oauthService.exchangeCode.mockResolvedValue(profile);
      authRepository.findByOAuthProvider.mockResolvedValue(null);
      authRepository.findByEmail.mockResolvedValue(null);
      authRepository.createOAuthUser.mockResolvedValue(newUser);
      authRepository.storeRefreshToken.mockResolvedValue(undefined);
      jwtService.sign.mockReturnValueOnce('access-token').mockReturnValueOnce('refresh-token');

      const result = await service.oauthLogin('github', 'auth-code');

      expect(result).toBeDefined();
      expect(result.needs_onboarding).toBe(true);
      expect(authRepository.createOAuthUser).toHaveBeenCalled();
      expect(notificationQueue.add).toHaveBeenCalled();
    });

    it('should throw InvalidProviderException for unsupported provider', async () => {
      await expect(service.oauthLogin('unsupported', 'auth-code')).rejects.toThrow(InvalidProviderException);
    });

    it('should throw AccountNotActiveException if OAuth account is inactive', async () => {
      const profile = {
        provider_user_id: 'google-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: null,
      };

      const inactiveUser: User = { ...mockUser, account_status: 'banned' };

      oauthService.exchangeCode.mockResolvedValue(profile);
      authRepository.findByOAuthProvider.mockResolvedValue(inactiveUser);

      await expect(service.oauthLogin('google', 'auth-code')).rejects.toThrow(AccountNotActiveException);
    });
  });

  describe('refreshToken', () => {
    it('should successfully refresh token with valid refresh token', async () => {
      const refreshDto: RefreshTokenDto = {
        refresh_token: 'old-refresh-token',
        token_family: '019501a0-0000-7000-8000-000000000001',
      };

      const payload = { sub: mockUser.id, family: refreshDto.token_family };

      jwtService.verify.mockReturnValue(payload);
      authRepository.getRefreshTokenHash.mockResolvedValue('$2b$10$hashed-token');
      authRepository.findById.mockResolvedValue(mockUser);
      authRepository.rotateRefreshToken.mockResolvedValue(undefined);
      (hashUtil.compareHash as jest.Mock).mockResolvedValue(true);
      jwtService.sign
        .mockReturnValueOnce('new-refresh-token')
        .mockReturnValueOnce('new-access-token');

      const result = await service.refreshToken(refreshDto);

      expect(result).toBeDefined();
      expect(result.access_token).toBe('new-access-token');
      expect(result.refresh_token).toBe('new-refresh-token');
      expect(authRepository.rotateRefreshToken).toHaveBeenCalled();
    });

    it('should throw SessionExpiredException if refresh token is invalid', async () => {
      const refreshDto: RefreshTokenDto = {
        refresh_token: 'invalid-token',
        token_family: '019501a0-0000-7000-8000-000000000001',
      };

      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.refreshToken(refreshDto)).rejects.toThrow(SessionExpiredException);
    });

    it('should revoke all sessions on token family mismatch', async () => {
      const refreshDto: RefreshTokenDto = {
        refresh_token: 'token',
        token_family: '019501a0-0000-7000-8000-000000000002',
      };

      const payload = { sub: mockUser.id, family: '019501a0-0000-7000-8000-000000000001' };

      jwtService.verify.mockReturnValue(payload);
      authRepository.revokeAllSessions.mockResolvedValue(undefined);

      await expect(service.refreshToken(refreshDto)).rejects.toThrow(TokenReuseException);
      expect(authRepository.revokeAllSessions).toHaveBeenCalledWith(mockUser.id);
    });

    it('should throw TokenReuseException if token hash not found', async () => {
      const refreshDto: RefreshTokenDto = {
        refresh_token: 'token',
        token_family: '019501a0-0000-7000-8000-000000000001',
      };

      const payload = { sub: mockUser.id, family: refreshDto.token_family };

      jwtService.verify.mockReturnValue(payload);
      authRepository.getRefreshTokenHash.mockResolvedValue(null);
      authRepository.revokeAllSessions.mockResolvedValue(undefined);

      await expect(service.refreshToken(refreshDto)).rejects.toThrow(TokenReuseException);
    });

    it('should throw AccountNotActiveException if user account is not active', async () => {
      const refreshDto: RefreshTokenDto = {
        refresh_token: 'token',
        token_family: '019501a0-0000-7000-8000-000000000001',
      };

      const payload = { sub: mockUser.id, family: refreshDto.token_family };
      const inactiveUser: User = { ...mockUser, account_status: 'deactivated' };

      jwtService.verify.mockReturnValue(payload);
      authRepository.getRefreshTokenHash.mockResolvedValue('$2b$10$hash');
      (hashUtil.compareHash as jest.Mock).mockResolvedValue(true);
      authRepository.findById.mockResolvedValue(inactiveUser);

      await expect(service.refreshToken(refreshDto)).rejects.toThrow(AccountNotActiveException);
    });
  });

  describe('logout', () => {
    it('should successfully revoke single session', async () => {
      const userId = mockUser.id;
      const tokenFamily = '019501a0-0000-7000-8000-000000000001';

      authRepository.deleteRefreshToken.mockResolvedValue(undefined);
      redisService.publish.mockResolvedValue(1);

      const result = await service.logout(userId, tokenFamily);

      expect(result.message).toBeDefined();
      expect(authRepository.deleteRefreshToken).toHaveBeenCalledWith(userId, tokenFamily);
      expect(redisService.publish).toHaveBeenCalledWith(
        AUTH_MODULE_CONSTANTS.TRANSACTIONAL_CHANNEL,
        expect.stringContaining(AUTH_MODULE_CONSTANTS.USER_LOGGED_OUT),
      );
    });

    it('should be idempotent - no error if token family does not exist', async () => {
      const userId = mockUser.id;
      const tokenFamily = 'non-existent-family';

      authRepository.deleteRefreshToken.mockResolvedValue(undefined);
      redisService.publish.mockResolvedValue(1);

      const result = await service.logout(userId, tokenFamily);

      expect(result).toBeDefined();
      expect(authRepository.deleteRefreshToken).toHaveBeenCalled();
    });
  });

  describe('logoutAll', () => {
    it('should revoke all sessions and increment token version', async () => {
      const userId = mockUser.id;

      authRepository.revokeAllSessions.mockResolvedValue(undefined);
      authRepository.incrementTokenVersion.mockResolvedValue(undefined);

      const result = await service.logoutAll(userId);

      expect(result.message).toBeDefined();
      expect(authRepository.revokeAllSessions).toHaveBeenCalledWith(userId);
      expect(authRepository.incrementTokenVersion).toHaveBeenCalledWith(userId);
    });
  });

  describe('getMe', () => {
    it('should return authenticated user profile', async () => {
      const userId = mockUser.id;

      authRepository.findById.mockResolvedValue(mockUser);

      const result = await service.getMe(userId);

      expect(result).toBeDefined();
      expect(result.id).toBe(mockUser.id);
      expect(result.email).toBe(mockUser.email);
      expect(result.username).toBe(mockUser.username);
      expect(result.role).toBe(mockUser.role);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      const userId = 'non-existent-id';

      authRepository.findById.mockResolvedValue(null);

      await expect(service.getMe(userId)).rejects.toThrow(UnauthorizedException);
    });
  });
});
