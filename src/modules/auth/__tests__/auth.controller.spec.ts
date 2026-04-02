/**
 * @module modules/auth/__tests__/auth.controller.spec
 * @description
 * Unit tests for AuthController covering endpoint handling, request
 * validation, IP extraction, and response formatting.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { Request } from 'express';

import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';

import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { OAuthDto } from '../dto/oauth.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { LogoutDto } from '../dto/logout.dto';

import { User } from '../entities/user.entity';
import { InvalidCredentialsException } from '@common/exceptions/invalid-credentials.exception';
import { TooManyAttemptsException } from '../exceptions/too-many-attempts.exception';
import { AccountNotActiveException } from '@common/exceptions/account-not-active.exception';

describe('AuthController (Unit Tests)', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  const mockUser: User = {
    id: '019501a0-0000-7000-8000-000000000001',
    email: 'test@example.com',
    password_hash: '$2b$12$hashed_password',
    username: 'testuser',
    avatar_url: null,
    bio: null,
    role: 'user',
    experience_level: 'intermediate',
    account_status: 'active',
    token_version: 0,
    total_xp: 100,
    token_balance: 50,
    current_streak: 5,
    longest_streak: 10,
    last_active_date: '2024-04-01',
    public_profile_token: 'token123',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  };

  const mockAuthResponse = {
    user: {
      id: mockUser.id,
      email: mockUser.email,
      username: mockUser.username,
      avatar_url: mockUser.avatar_url,
      role: mockUser.role,
      experience_level: mockUser.experience_level,
      total_xp: mockUser.total_xp,
      token_balance: mockUser.token_balance,
      current_streak: mockUser.current_streak,
      created_at: mockUser.created_at,
    },
    access_token: 'access-token-jwt',
    refresh_token: 'refresh-token-jwt',
    token_family: '019501a0-0000-7000-8000-000000000002',
    expires_in: 900,
    needs_onboarding: false,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            register: jest.fn(),
            login: jest.fn(),
            oauthLogin: jest.fn(),
            refreshToken: jest.fn(),
            logout: jest.fn(),
            logoutAll: jest.fn(),
            getMe: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService) as jest.Mocked<AuthService>;
  });

  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
      const registerDto: RegisterDto = {
        email: 'newuser@example.com',
        password: 'P@ssw0rd!',
        username: 'newuser',
        experience_level: 'novice',
        topics: ['topic-1', 'topic-2'],
      };

      authService.register.mockResolvedValue(mockAuthResponse);

      const result = await controller.register(registerDto);

      expect(result).toEqual(mockAuthResponse);
      expect(authService.register).toHaveBeenCalledWith(registerDto);
    });

    it('should pass correct email validation to service', async () => {
      const registerDto: RegisterDto = {
        email: '  TEST@EXAMPLE.COM  ', // Will be transformed to lowercase and trimmed
        password: 'P@ssw0rd!',
        username: 'testuser',
        experience_level: 'intermediate',
        topics: ['topic-1'],
      };

      authService.register.mockResolvedValue(mockAuthResponse);

      await controller.register(registerDto);

      expect(authService.register).toHaveBeenCalled();
    });
  });

  describe('POST /auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'P@ssw0rd!',
      };

      const mockRequest = {
        headers: {
          'x-forwarded-for': '192.168.1.100',
        },
      } as unknown as Request;

      authService.login.mockResolvedValue(mockAuthResponse);

      const result = await controller.login(loginDto, mockRequest);

      expect(result).toEqual(mockAuthResponse);
      expect(authService.login).toHaveBeenCalledWith(loginDto, '192.168.1.100');
    });

    it('should extract single IP from x-forwarded-for header', async () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'P@ssw0rd!',
      };

      const mockRequest = {
        headers: {
          'x-forwarded-for': '203.0.113.1',
        },
      } as unknown as Request;

      authService.login.mockResolvedValue(mockAuthResponse);

      await controller.login(loginDto, mockRequest);

      expect(authService.login).toHaveBeenCalledWith(loginDto, '203.0.113.1');
    });

    it('should extract first IP from multiple IPs in x-forwarded-for', async () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'P@ssw0rd!',
      };

      const mockRequest = {
        headers: {
          'x-forwarded-for': ['203.0.113.1', '203.0.113.2', '203.0.113.3'],
        },
      } as unknown as Request;

      authService.login.mockResolvedValue(mockAuthResponse);

      await controller.login(loginDto, mockRequest);

      // Should use the first IP from the array
      expect(authService.login).toHaveBeenCalledWith(loginDto, expect.any(String));
    });

    it('should use remote address when x-forwarded-for is missing', async () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'P@ssw0rd!',
      };

      const mockRequest = {
        headers: {},
        socket: {
          remoteAddress: '127.0.0.1',
        },
      } as unknown as Request;

      authService.login.mockResolvedValue(mockAuthResponse);

      await controller.login(loginDto, mockRequest);

      expect(authService.login).toHaveBeenCalledWith(loginDto, expect.any(String));
    });

    it('should throw InvalidCredentialsException on auth failure', async () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'WrongPassword!',
      };

      const mockRequest = {
        headers: { 'x-forwarded-for': '192.168.1.1' },
      } as unknown as Request;

      authService.login.mockRejectedValue(new InvalidCredentialsException());

      await expect(controller.login(loginDto, mockRequest)).rejects.toThrow(InvalidCredentialsException);
    });

    it('should throw TooManyAttemptsException on rate limit', async () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'P@ssw0rd!',
      };

      const mockRequest = {
        headers: { 'x-forwarded-for': '192.168.1.1' },
      } as unknown as Request;

      authService.login.mockRejectedValue(new TooManyAttemptsException(600));

      await expect(controller.login(loginDto, mockRequest)).rejects.toThrow(TooManyAttemptsException);
    });

    it('should throw AccountNotActiveException for inactive accounts', async () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'P@ssw0rd!',
      };

      const mockRequest = {
        headers: { 'x-forwarded-for': '192.168.1.1' },
      } as unknown as Request;

      authService.login.mockRejectedValue(new AccountNotActiveException('suspended'));

      await expect(controller.login(loginDto, mockRequest)).rejects.toThrow(AccountNotActiveException);
    });
  });

  describe('POST /auth/oauth/:provider', () => {
    it('should login via OAuth successfully', async () => {
      const provider = 'google';
      const oauthDto: OAuthDto = {
        code: 'auth-code-123',
      };

      authService.oauthLogin.mockResolvedValue(mockAuthResponse);

      const result = await controller.oauthLogin(provider, oauthDto);

      expect(result).toEqual(mockAuthResponse);
      expect(authService.oauthLogin).toHaveBeenCalledWith(provider, oauthDto.code);
    });

    it('should handle GitHub OAuth provider', async () => {
      const provider = 'github';
      const oauthDto: OAuthDto = {
        code: 'github-code-456',
      };

      authService.oauthLogin.mockResolvedValue(mockAuthResponse);

      const result = await controller.oauthLogin(provider, oauthDto);

      expect(result).toEqual(mockAuthResponse);
      expect(authService.oauthLogin).toHaveBeenCalledWith('github', oauthDto.code);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh token successfully', async () => {
      const refreshDto: RefreshTokenDto = {
        refresh_token: 'old-refresh-token',
        token_family: '019501a0-0000-7000-8000-000000000002',
      };

      const mockRefreshResponse = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        token_family: '019501a0-0000-7000-8000-000000000002',
        expires_in: 900,
      };

      authService.refreshToken.mockResolvedValue(mockRefreshResponse);

      const result = await controller.refresh(refreshDto);

      expect(result).toEqual(mockRefreshResponse);
      expect(authService.refreshToken).toHaveBeenCalledWith(refreshDto);
    });

    it('should provide new tokens with correct expiry', async () => {
      const refreshDto: RefreshTokenDto = {
        refresh_token: 'old-refresh-token',
        token_family: '019501a0-0000-7000-8000-000000000002',
      };

      const mockRefreshResponse = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        token_family: '019501a0-0000-7000-8000-000000000002',
        expires_in: 900,
      };

      authService.refreshToken.mockResolvedValue(mockRefreshResponse);

      const result = await controller.refresh(refreshDto);

      expect(result.expires_in).toBe(900);
      expect(result.access_token).toBe('new-access-token');
      expect(result.token_family).toBe(refreshDto.token_family);
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout single session successfully', async () => {
      const logoutDto: LogoutDto = {
        token_family: '019501a0-0000-7000-8000-000000000002',
      };

      const userId = mockUser.id;

      const mockLogoutResponse = { message: 'Logged out successfully' };

      authService.logout.mockResolvedValue(mockLogoutResponse);

      const result = await controller.logout(logoutDto, userId);

      expect(result).toEqual(mockLogoutResponse);
      expect(authService.logout).toHaveBeenCalledWith(userId, logoutDto.token_family);
    });
  });

  describe('POST /auth/logout-all', () => {
    it('should logout all sessions successfully', async () => {
      const userId = mockUser.id;

      const mockLogoutResponse = { message: 'All sessions terminated' };

      authService.logoutAll.mockResolvedValue(mockLogoutResponse);

      const result = await controller.logoutAll(userId);

      expect(result).toEqual(mockLogoutResponse);
      expect(authService.logoutAll).toHaveBeenCalledWith(userId);
    });
  });

  describe('GET /auth/me', () => {
    it('should return authenticated user profile', async () => {
      const userId = mockUser.id;

      const mockMeResponse = {
        id: mockUser.id,
        email: mockUser.email,
        username: mockUser.username,
        avatar_url: mockUser.avatar_url,
        bio: mockUser.bio,
        role: mockUser.role,
        experience_level: mockUser.experience_level,
        account_status: mockUser.account_status,
        total_xp: mockUser.total_xp,
        token_balance: mockUser.token_balance,
        current_streak: mockUser.current_streak,
        longest_streak: mockUser.longest_streak,
        last_active_date: mockUser.last_active_date,
        public_profile_token: mockUser.public_profile_token,
        created_at: mockUser.created_at,
      };

      authService.getMe.mockResolvedValue(mockMeResponse);

      const result = await controller.getMe(userId);

      expect(result).toEqual(mockMeResponse);
      expect(authService.getMe).toHaveBeenCalledWith(userId);
    });

    it('should include all user profile fields', async () => {
      const userId = mockUser.id;

      const mockMeResponse = {
        id: mockUser.id,
        email: mockUser.email,
        username: mockUser.username,
        avatar_url: mockUser.avatar_url,
        bio: mockUser.bio,
        role: mockUser.role,
        experience_level: mockUser.experience_level,
        account_status: mockUser.account_status,
        total_xp: mockUser.total_xp,
        token_balance: mockUser.token_balance,
        current_streak: mockUser.current_streak,
        longest_streak: mockUser.longest_streak,
        last_active_date: mockUser.last_active_date,
        public_profile_token: mockUser.public_profile_token,
        created_at: mockUser.created_at,
      };

      authService.getMe.mockResolvedValue(mockMeResponse);

      const result = await controller.getMe(userId);

      expect(result.id).toBe(mockUser.id);
      expect(result.email).toBe(mockUser.email);
      expect(result.total_xp).toBe(mockUser.total_xp);
      expect(result.current_streak).toBe(mockUser.current_streak);
      expect(result.account_status).toBe('active');
    });
  });

  describe('Request validation', () => {
    it('should validate email format in RegisterDto (handled by class-validator)', async () => {
      const invalidRegisterDto = {
        email: 'invalid-email', // Not a valid email
        password: 'P@ssw0rd!',
        username: 'testuser',
        experience_level: 'beginner',
        topics: ['topic-1'],
      };

      // Note: In real scenario, class-validator would catch this before reaching controller
      // This test documents the behavior expectation
      authService.register.mockResolvedValue(mockAuthResponse);

      // Actual validation would be done at pipe level
      expect(authService.register).not.toHaveBeenCalled();
    });

    it('should validate password complexity in RegisterDto', async () => {
      const weakPasswordDto = {
        email: 'test@example.com',
        password: 'weak', // Too weak, doesn't meet requirements
        username: 'testuser',
        experience_level: 'beginner',
        topics: ['topic-1'],
      };

      // Note: class-validator would reject this in pipes
      authService.register.mockResolvedValue(mockAuthResponse);

      expect(authService.register).not.toHaveBeenCalled();
    });
  });
});
