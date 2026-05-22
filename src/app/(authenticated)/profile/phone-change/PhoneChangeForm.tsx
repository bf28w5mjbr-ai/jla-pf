"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeIntegerNumericInput } from "@/lib/numericInput";
import { AutofillSyncForm } from "@/components/ui/autofill-sync-form";
import {
  PhoneNumberField,
  validatePhoneFieldValue,
} from "@/components/ui/PhoneNumberField";
import { toNationalFormat } from "@/lib/phone";

interface Props {
  currentPhone: string;
}

export default function PhoneChangeForm({ currentPhone }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<"verify" | "change">("verify");
  const [password, setPassword] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const displayCurrent =
    currentPhone.startsWith("+") ? toNationalFormat(currentPhone) : currentPhone;

  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOtp(normalizeIntegerNumericInput(e.target.value));
  };

  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/user/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "認証に失敗しました");
        return;
      }

      setStep("change");
    } catch {
      setError("エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async () => {
    const phoneErr = validatePhoneFieldValue(newPhone, true);
    if (phoneErr) {
      setError(phoneErr);
      return;
    }

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/user/phone-change/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: newPhone }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "OTP送信に失敗しました");
        return;
      }

      alert("確認コードを送信しました");
    } catch {
      setError("エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    const phoneErr = validatePhoneFieldValue(newPhone, true);
    if (phoneErr) {
      setError(phoneErr);
      return;
    }

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/user/phone-change/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: newPhone, otp }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "認証に失敗しました");
        return;
      }

      alert("電話番号を変更しました");
      router.push("/profile");
      router.refresh();
    } catch {
      setError("エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  if (step === "verify") {
    return (
      <AutofillSyncForm onSubmit={handleVerifyPassword} className="space-y-6">
        <div className="bg-orange-50 dark:bg-orange-950 border-2 border-orange-200 dark:border-orange-800 rounded-lg p-6">
          <label className="block text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">
            現在の電話番号
          </label>
          <p className="text-3xl font-mono font-black text-black dark:text-white tracking-wide">
            {displayCurrent}
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">
            パスワード <span className="text-red-600 dark:text-red-400">*</span>
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-base bg-white dark:bg-gray-900 text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            placeholder="パスワードを入力"
            required
            minLength={8}
          />
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            本人確認のため、パスワードを入力してください
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-base text-red-800">
            ❌ {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-orange-600 text-white text-base font-semibold py-3 rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "確認中..." : "次へ"}
        </button>
      </AutofillSyncForm>
    );
  }

  return (
    <AutofillSyncForm onSubmit={handleVerifyOTP} className="space-y-6">
      <PhoneNumberField
        id="newPhone"
        label="新しい電話番号"
        value={newPhone}
        onChange={setNewPhone}
        mobileOnly
        required
        hint="SMSで認証できる携帯電話番号"
      />

      <button
        type="button"
        onClick={handleSendOTP}
        disabled={loading || !newPhone}
        className="w-full bg-gray-600 dark:bg-gray-700 text-white text-base font-semibold py-3 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed border border-gray-700 dark:border-gray-600 transition-colors"
      >
        {loading ? "送信中..." : "確認コードを送信"}
      </button>

      <div>
        <label className="block text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">
          確認コード <span className="text-red-600 dark:text-red-400">*</span>
        </label>
        <input
          type="text"
          value={otp}
          onChange={handleOtpChange}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-base font-mono text-center text-2xl tracking-widest bg-white dark:bg-gray-900 text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          placeholder="000000"
          inputMode="numeric"
          required
          pattern="\d{6}"
          maxLength={6}
        />
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
          SMSで送信された6桁の数字を入力してください
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-base text-red-800">
          ❌ {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-orange-600 text-white text-base font-semibold py-3 rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "変更中..." : "電話番号を変更"}
      </button>
    </AutofillSyncForm>
  );
}
