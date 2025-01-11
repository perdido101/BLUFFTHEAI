import { jest } from '@jest/globals';
import { AchievementService } from '../achievementService';
import { Achievement } from '../../types';

describe('AchievementService', () => {
  let achievementService: AchievementService;
  let mockPersistenceService: jest.Mocked<any>;

  beforeEach(() => {
    mockPersistenceService = {
      saveAchievement: jest.fn(),
      loadAchievement: jest.fn()
    };
    achievementService = new AchievementService(mockPersistenceService);
  });

  it('should unlock achievement when conditions are met', async () => {
    const achievement: Achievement = {
      id: 'test-achievement',
      name: 'Test Achievement',
      description: 'Test Description',
      condition: 'test-condition',
      progress: 0,
      isUnlocked: false
    };

    expect(achievement.isUnlocked).toBe(false);
    expect(achievement.progress).toBe(0);
    expect(mockPersistenceService.saveAchievement).not.toHaveBeenCalled();

    await achievementService.updateProgress(achievement, 100);

    expect(achievement.isUnlocked).toBe(true);
    expect(achievement.progress).toBe(100);
    expect(mockPersistenceService.saveAchievement).toHaveBeenCalledWith(achievement);
  });

  it('should update progress without unlocking when conditions are not met', async () => {
    const achievement: Achievement = {
      id: 'test-achievement',
      name: 'Test Achievement',
      description: 'Test Description',
      condition: 'test-condition',
      progress: 0,
      isUnlocked: false,
      requiredProgress: 100
    };

    await achievementService.updateProgress(achievement, 50);

    expect(achievement.isUnlocked).toBe(false);
    expect(achievement.progress).toBe(50);
    expect(mockPersistenceService.saveAchievement).toHaveBeenCalledWith(achievement);
  });

  it('should load achievements from persistence service', async () => {
    const mockAchievements: Achievement[] = [
      {
        id: 'test-achievement-1',
        name: 'Test Achievement 1',
        description: 'Test Description 1',
        condition: 'test-condition-1',
        progress: 0,
        isUnlocked: false
      }
    ];

    mockPersistenceService.loadAchievement.mockResolvedValue(mockAchievements);

    const loadedAchievements = await achievementService.loadAchievements();
    expect(loadedAchievements).toEqual(mockAchievements);
  });

  it('should handle errors when loading achievements', async () => {
    const mockError = new Error('Failed to load achievements');
    mockPersistenceService.loadAchievement.mockRejectedValue(mockError);

    const loadedAchievements = await achievementService.loadAchievements();
    expect(loadedAchievements).toEqual([]);
  });
}); 