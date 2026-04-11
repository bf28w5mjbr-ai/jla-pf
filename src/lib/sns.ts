/**
 * AWS SNS SMS送信ユーティリティ
 */

import { SNSClient, PublishCommand, PublishCommandInput } from '@aws-sdk/client-sns';

// AWS SNS Clientの初期化
const snsClient = new SNSClient({
  region: process.env.AWS_REGION || 'ap-northeast-1', // 東京リージョン
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

/**
 * SMS経由でOTPを送信
 * 
 * @param phoneNumber E.164形式の電話番号 (+819012345678)
 * @param otp 6桁のOTP
 * @throws {Error} SMS送信に失敗した場合
 * 
 * @example
 * await sendOTPviaSMS("+819012345678", "123456")
 */
export async function sendOTPviaSMS(phoneNumber: string, otp: string): Promise<void> {
  // 開発環境ではコンソールに出力してスキップ
  if (process.env.SKIP_SMS === 'true') {
    console.log(`[DEV] OTP for ${phoneNumber}: ${otp}`);
    return;
  }

  const message = `Bluvium 認証コード: ${otp}\n\n有効期限は5分です。\nこのコードを第三者に教えないでください。`;

  const params: PublishCommandInput = {
    Message: message,
    PhoneNumber: phoneNumber,
    MessageAttributes: {
      'AWS.SNS.SMS.SMSType': {
        DataType: 'String',
        StringValue: 'Transactional', // トランザクショナルSMS（高優先度）
      },
      'AWS.SNS.SMS.SenderID': {
        DataType: 'String',
        StringValue: 'JLAPF', // 送信者ID（日本では表示されない場合あり）
      },
    },
  };

  try {
    const command = new PublishCommand(params);
    const response = await snsClient.send(command);
    
    console.log(`SMS sent successfully to ${phoneNumber}. MessageId: ${response.MessageId}`);
  } catch (error) {
    console.error('Failed to send SMS via SNS:', error);
    throw new Error('SMS送信に失敗しました。しばらくしてから再度お試しください。');
  }
}

/**
 * セキュリティ通知用 SMS（OTP 以外）。ログイン通知・アカウント変更通知など。
 */
export async function sendSecurityNoticeSms(
  phoneNumber: string,
  message: string
): Promise<void> {
  if (process.env.SKIP_SMS === 'true') {
    console.log(`[DEV] Security SMS to ${phoneNumber}: ${message}`);
    return;
  }

  const params: PublishCommandInput = {
    Message: message.slice(0, 1400),
    PhoneNumber: phoneNumber,
    MessageAttributes: {
      'AWS.SNS.SMS.SMSType': {
        DataType: 'String',
        StringValue: 'Transactional',
      },
      'AWS.SNS.SMS.SenderID': {
        DataType: 'String',
        StringValue: 'JLAPF',
      },
    },
  };

  const command = new PublishCommand(params);
  await snsClient.send(command);
}

/**
 * テスト用: SMSをモック送信（開発環境）
 * 
 * @param phoneNumber 電話番号
 * @param otp OTP
 */
export async function sendOTPviaSMS_Mock(phoneNumber: string, otp: string): Promise<void> {
  console.log(`[MOCK SMS] To: ${phoneNumber}`);
  console.log(`[MOCK SMS] Message: Bluvium 認証コード: ${otp}`);
  console.log(`[MOCK SMS] 有効期限は5分です。`);
  
  // モック遅延（実際のSMS送信をシミュレート）
  await new Promise(resolve => setTimeout(resolve, 100));
}
