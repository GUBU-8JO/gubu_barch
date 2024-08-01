import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { SubscriptionHistory } from './entities/subscription-histories.entity';
import { Review } from './entities/review.entity';
import { Platform } from './entities/platforms.entity';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(SubscriptionHistory)
    private subscriptionHistoriesRepository: Repository<SubscriptionHistory>,
    @InjectRepository(Review)
    private reviewRepository: Repository<Review>,
    @InjectRepository(Platform)
    private platformRepository: Repository<Platform>,
  ) {}

  /** 알림 생성 스케쥴링 */
  @Cron('* * 00 * * *')
  async createNotification() {
    this.logger.debug('알림 시작!');

    // 결제 이력 가져오기
    const subscriptionHistories = await this.getSubscriptionHistories();
    console.log('결제이력', subscriptionHistories);

    // today 설정
    const today = this.setToday();
    console.log('today', today);

    // 결제정보 순회하면서 다음 결제일 가져오기
    for (const subscriptionHistory of subscriptionHistories) {
      // 결제일 설정(일단, 결제 시작일)
      const payDate = subscriptionHistory.nextPayAt;
      console.log('payDate', payDate);
      // 알람일 설정(결제일 -1)
      const notifyingDate = this.getNotifyingDate(payDate);
      console.log('notifyingDate', notifyingDate);

      // today와 notifyingDate 비교하여 알림 생성
      if (notifyingDate.getTime() === today.getTime()) {
        // user nickname 가져오기
        const newNotification =
          await this.createNotifications(subscriptionHistory);
        console.log('알림 발생', newNotification);

        // subscriptionHistory의 NextDate 업데이트
        const nextPayDate = new Date(payDate);
        // 결제주기 가져오기
        this.updateNextDate(nextPayDate, subscriptionHistory);
      } else {
        // 알림 미생성 테스트를 위해 추가
        const userNickname = subscriptionHistory.userSubscription.user.nickname;
        console.log('알림 미발생', `${userNickname} 알림받을 날짜가 아닙니다`);
      }
    }
  }

  // subscriptionHistory데이터 가져오기
  async getSubscriptionHistories() {
    return await this.subscriptionHistoriesRepository.find({
      relations: [
        'userSubscription',
        'userSubscription.user',
        'userSubscription.platform',
      ],
    });
  }

  // today 설정하기
  setToday(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // 시간 초기화
    return today;
  }

  // notifyingDate 설정하기
  getNotifyingDate(payDate: Date): Date {
    const notifyingDate = new Date(payDate);
    notifyingDate.setDate(notifyingDate.getDate() - 1); // 1일 전으로 설정
    notifyingDate.setHours(0, 0, 0, 0); // 시간 초기화
    return notifyingDate;
  }

  // notification 생성하기
  async createNotifications(subscriptionHistory: any) {
    const userNickname = subscriptionHistory.userSubscription.user.nickname;
    const platformTitle = subscriptionHistory.userSubscription.platform.title;
    const message = `${userNickname}님 ${platformTitle}결제일 1일 전입니다.`;
    console.log(message);

    const newNotification = await this.notificationRepository.save({
      userId: subscriptionHistory.userSubscription.userId,
      userSubscriptionId: subscriptionHistory.userSubscriptionId,
      title: message,
      isRead: false,
      createdAt: new Date(),
      readedAt: new Date(), // Default를 null로 지정필요
    });
    return newNotification;
  }

  // subscriptionHistory의 NextDate 변경하기
  async updateNextDate(nextPayDate: Date, subscriptionHistory: any) {
    const period = subscriptionHistory.userSubscription.period;
    console.log('기간', period);
    nextPayDate.setMonth(nextPayDate.getMonth() + period);
    await this.subscriptionHistoriesRepository.update(subscriptionHistory, {
      nextPayAt: nextPayDate,
    });
  }

  /** 평점 계산 스케쥴링 */
  @Cron('* * 00 * * *')
  async ratingCalculation() {
    this.logger.debug('평점 계산 시작!');

    // 리뷰 가져오기
    const platformsReview = await this.findPlatformsReview();
    console.log(platformsReview);

    // platform의 review 그룹화하기
    const platformReviews = {};

    // platformId에 맞는 rate 추가
    for (const review of platformsReview) {
      // rate 없으면 빈 배열
      if (!platformReviews[review.platformId]) {
        platformReviews[review.platformId] = [];
      }
      platformReviews[review.platformId].push(review.rate);
    }

    // 각 platform의 rating 계산 후 업데이트
    for (const platformId in platformReviews) {
      const reviewRates = platformReviews[platformId];
      const totalRate = reviewRates.reduce((sum, rate) => sum + rate, 0);
      const averageRating = totalRate / reviewRates.length;

      // 소수점 반올림
      const roundsRating = parseFloat(averageRating.toFixed(0));

      // platform의 rating 변경하기
      await this.platformRepository.update(platformId, {
        rating: roundsRating,
      });
    }
  }

  // review 가져오기
  async findPlatformsReview() {
    return await this.reviewRepository.find({
      relations: ['platform'],
    });
  }
}
