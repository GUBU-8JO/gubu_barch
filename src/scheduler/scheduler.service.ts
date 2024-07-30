import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Notifications } from './entities/notification.entity';
import { SubscriptionHistories } from './entities/subscription-histories.entity';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectRepository(Notifications)
    private notificationRepository: Repository<Notifications>,
    @InjectRepository(SubscriptionHistories)
    private subscriptionHistoriesRepository: Repository<SubscriptionHistories>,
  ) {}

  @Cron('30 * * * * *')
  async handleCron() {
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
      const payDate = subscriptionHistory.nextDate;
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

  async getSubscriptionHistories() {
    return await this.subscriptionHistoriesRepository.find({
      relations: ['userSubscription', 'userSubscription.user'],
    });
  }

  setToday(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // 시간 초기화
    return today;
  }

  getNotifyingDate(payDate: Date): Date {
    const notifyingDate = new Date(payDate);
    notifyingDate.setDate(notifyingDate.getDate() - 1); // 1일 전으로 설정
    notifyingDate.setHours(0, 0, 0, 0); // 시간 초기화
    return notifyingDate;
  }

  async createNotifications(subscriptionHistory: any) {
    const userNickname = subscriptionHistory.userSubscription.user.nickname;
    const message = `${userNickname}님 결제일 1일 전입니다.`;
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

  async updateNextDate(nextPayDate: Date, subscriptionHistory: any) {
    const period = subscriptionHistory.userSubscription.period;
    console.log('기간', period);
    nextPayDate.setMonth(nextPayDate.getMonth() + period);
    await this.subscriptionHistoriesRepository.update(subscriptionHistory, {
      nextDate: nextPayDate,
    });
  }
}
