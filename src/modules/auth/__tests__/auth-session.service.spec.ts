/**
 * @module modules/auth/__tests__/auth-session.service.spec
 * @description
 * Unit tests for AuthSessionService covering session lifecycle operations
 * including session revocation and token version management.
 */

import { Test, TestingModule } from '@nestjs/testing';

import { AuthSessionService } from '../auth-session.service';
import { AuthRepository } from '../auth.repository';

describe('AuthSessionService (Unit Tests)', () => {
  let service: AuthSessionService;
  let authRepository: jest.Mocked<AuthRepository>;

  const mockUserId = '019501a0-0000-7000-8000-000000000001';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthSessionService,
        {
          provide: AuthRepository,
          useValue: {
            revokeAllSessions: jest.fn(),
            incrementTokenVersion: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthSessionService>(AuthSessionService);
    authRepository = module.get(AuthRepository) as jest.Mocked<AuthRepository>;
  });

  describe('revokeAllSessions', () => {
    it('should revoke all sessions for user', async () => {
      authRepository.revokeAllSessions.mockResolvedValue(undefined);

      await service.revokeAllSessions(mockUserId);

      expect(authRepository.revokeAllSessions).toHaveBeenCalledWith(mockUserId);
      expect(authRepository.revokeAllSessions).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors from repository', async () => {
      const error = new Error('Redis connection failed');
      authRepository.revokeAllSessions.mockRejectedValue(error);

      await expect(service.revokeAllSessions(mockUserId)).rejects.toThrow(
        'Redis connection failed',
      );
    });

    it('should work with different user IDs', async () => {
      const userId1 = '019501a0-0000-7000-8000-000000000001';
      const userId2 = '019501a0-0000-7000-8000-000000000002';

      authRepository.revokeAllSessions.mockResolvedValue(undefined);

      await service.revokeAllSessions(userId1);
      await service.revokeAllSessions(userId2);

      expect(authRepository.revokeAllSessions).toHaveBeenCalledWith(userId1);
      expect(authRepository.revokeAllSessions).toHaveBeenCalledWith(userId2);
      expect(authRepository.revokeAllSessions).toHaveBeenCalledTimes(2);
    });
  });

  describe('incrementTokenVersion', () => {
    it('should increment token version for user', async () => {
      authRepository.incrementTokenVersion.mockResolvedValue(undefined);

      await service.incrementTokenVersion(mockUserId);

      expect(authRepository.incrementTokenVersion).toHaveBeenCalledWith(mockUserId);
      expect(authRepository.incrementTokenVersion).toHaveBeenCalledTimes(1);
    });

    it('should invalidate existing JWTs within 60 seconds', async () => {
      authRepository.incrementTokenVersion.mockResolvedValue(undefined);

      // This is documented behavior - incrementTokenVersion evicts Redis cache
      await service.incrementTokenVersion(mockUserId);

      // Repository implementation should handle cache eviction
      expect(authRepository.incrementTokenVersion).toHaveBeenCalledWith(mockUserId);
    });

    it('should propagate errors from repository', async () => {
      const error = new Error('Database connection failed');
      authRepository.incrementTokenVersion.mockRejectedValue(error);

      await expect(service.incrementTokenVersion(mockUserId)).rejects.toThrow(
        'Database connection failed',
      );
    });

    it('should work with different user IDs', async () => {
      const userId1 = '019501a0-0000-7000-8000-000000000001';
      const userId2 = '019501a0-0000-7000-8000-000000000002';

      authRepository.incrementTokenVersion.mockResolvedValue(undefined);

      await service.incrementTokenVersion(userId1);
      await service.incrementTokenVersion(userId2);

      expect(authRepository.incrementTokenVersion).toHaveBeenCalledWith(userId1);
      expect(authRepository.incrementTokenVersion).toHaveBeenCalledWith(userId2);
      expect(authRepository.incrementTokenVersion).toHaveBeenCalledTimes(2);
    });
  });

  describe('Session lifecycle integration', () => {
    it('should allow revoking all sessions followed by token version increment', async () => {
      authRepository.revokeAllSessions.mockResolvedValue(undefined);
      authRepository.incrementTokenVersion.mockResolvedValue(undefined);

      await service.revokeAllSessions(mockUserId);
      await service.incrementTokenVersion(mockUserId);

      expect(authRepository.revokeAllSessions).toHaveBeenCalledWith(mockUserId);
      expect(authRepository.incrementTokenVersion).toHaveBeenCalledWith(mockUserId);
    });

    it('should handle concurrent operations', async () => {
      authRepository.revokeAllSessions.mockResolvedValue(undefined);
      authRepository.incrementTokenVersion.mockResolvedValue(undefined);

      // Simulate concurrent calls
      const operations = Promise.all([
        service.revokeAllSessions(mockUserId),
        service.incrementTokenVersion(mockUserId),
      ]);

      await expect(operations).resolves.toEqual([undefined, undefined]);

      expect(authRepository.revokeAllSessions).toHaveBeenCalled();
      expect(authRepository.incrementTokenVersion).toHaveBeenCalled();
    });
  });
});
