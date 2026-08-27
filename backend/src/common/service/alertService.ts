// src/service/alertService.ts
import { sendEmail, adminEmail } from "../utils/email";

export interface HashrateAlert {
  timestamp: number;
  gmt_time: string;
  hashrate: number;
  income: number;
  consecutiveDays: number;
}

class AlertService {
  private zeroHashrateStreak: number = 0;
  private lastAlertDate: string = '';
  private alertCooldown: Map<string, number> = new Map();

  async checkHashrateAlerts(rewardsData: any): Promise<void> {
    const latestReward = rewardsData.income?.[0];

    if (!latestReward) return;

    const hashrate = latestReward.total_hashrate || 0;
    const currentDate = new Date().toDateString();

    // Reset streak if we have hashrate
    if (hashrate > 0) {
      if (this.zeroHashrateStreak > 0) {
        console.log(`✅ Hashrate restored after ${this.zeroHashrateStreak} days of zero values`);
        this.zeroHashrateStreak = 0;
      }
      return;
    }

    // Increment streak for zero hashrate
    this.zeroHashrateStreak++;

    // Check if we already sent an alert today
    if (this.lastAlertDate === currentDate) {
      return;
    }

    let priority: string;
    let subject: string;
    let body: string;

    if (this.zeroHashrateStreak >= 7) {
      priority = 'HIGH';
      subject = `🚨 CRITICAL: 7+ Days Zero Hashrate Detected`;
    } else if (this.zeroHashrateStreak >= 2) {
      priority = 'MODERATE';
      subject = `⚠️ ALERT: ${this.zeroHashrateStreak} Days Zero Hashrate`;
    } else {
      priority = 'LOW';
      subject = `ℹ️ NOTICE: Zero Hashrate Detected Today`;
    }

    body = this.generateAlertBody(latestReward, priority);

    try {
      await sendEmail(adminEmail, subject, body);
      this.lastAlertDate = currentDate;
      console.log(`📧 ${priority} priority alert sent for ${this.zeroHashrateStreak} days zero hashrate`);
    } catch (error) {
      console.error('Failed to send alert email:', error);
    }
  }

  private generateAlertBody(reward: any, priority: string): string {
    return `
Hashrate Alert - ${priority} Priority

🔍 Alert Details:
- Timestamp: ${reward.gmt_time}
- Days with Zero Hashrate: ${this.zeroHashrateStreak}
- Income: ${reward.income} BTC
- Type: ${reward.type}
- Code: ${reward.code}

📊 Current Status:
- Total Hashrate: ${reward.total_hashrate} H/s
- Hashrate String: ${reward.total_hashrate_str}

🚨 Recommended Actions:
${this.getRecommendedActions(priority)}

This is an automated alert. Please investigate the mining pool status.
    `.trim();
  }

  private getRecommendedActions(priority: string): string {
    const actions: { [key: string]: string } = {
      LOW: '- Check pool connection\n- Verify miner status\n- Monitor for next data point',
      MODERATE: '- Investigate miner configuration\n- Check network connectivity\n- Review pool status page\n- Contact pool support if needed',
      HIGH: '- IMMEDIATE ACTION REQUIRED\n- Check all mining equipment\n- Verify pool maintenance status\n- Contact technical support urgently\n- Consider switching to backup pool'
    };

    return actions[priority] || actions.LOW;
  }

  getCurrentStreak(): number {
    return this.zeroHashrateStreak;
  }

  resetStreak(): void {
    this.zeroHashrateStreak = 0;
    this.lastAlertDate = '';
  }
}

export const alertService = new AlertService();
