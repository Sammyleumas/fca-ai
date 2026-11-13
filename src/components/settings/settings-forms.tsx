"use client";

import { useActionState, useState } from "react";
import { Download, Lock, Save, Trash2 } from "lucide-react";
import {
  changePassword,
  deleteAccount,
  saveLearning,
  saveNotifications,
  saveProfile,
  type SettingsState,
} from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/feedback";
import { CardHeader, GlassCard } from "@/components/ui/glass-card";
import { PasswordField, TextField } from "@/components/ui/input";
import { EDUCATION_LEVELS, LEARNING_GOALS, STUDY_TIMES } from "@/lib/validation/profile";
import type { NotificationPrefs, ProfileRow } from "@/types/db";

const selectClass =
  "glass h-14 w-full rounded-2xl px-4 text-[15px] text-fg outline-none focus:border-accent/60 [&>option]:bg-bg-2";

function Messages({ state }: { state: SettingsState }) {
  return (
    <>
      <FormMessage>{state.error}</FormMessage>
      <FormMessage tone="success">{state.success}</FormMessage>
    </>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <GlassCard className="scroll-mt-24 p-5 sm:p-6" id={id} aria-labelledby={`${id}-title`}>
      <div id={`${id}-title`}>
        <CardHeader title={title} />
      </div>
      <div className="mt-5">{children}</div>
    </GlassCard>
  );
}

export function ProfileForm({ profile, email }: { profile: ProfileRow; email: string | null }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveProfile, {});
  return (
    <Section id="profile" title="Profile">
      <form action={action} className="space-y-4">
        <Messages state={state} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Preferred name" name="preferred_name" defaultValue={profile.preferred_name ?? ""} error={state.fields?.preferred_name} maxLength={60} required />
          <TextField label="Full name (optional)" name="full_name" defaultValue={profile.full_name ?? ""} error={state.fields?.full_name} maxLength={120} />
        </div>
        <TextField label="Email" value={email ?? ""} readOnly disabled hint="Contact support to change your sign-in email." />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="education_level" className="block text-sm font-medium text-fg-2">Education level</label>
            <select id="education_level" name="education_level" defaultValue={profile.education_level ?? ""} className={selectClass}>
              <option value="">Prefer not to say</option>
              {EDUCATION_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
          <TimezoneSelect defaultValue={profile.timezone} error={state.fields?.timezone} />
        </div>
        <Button type="submit" loading={pending}><Save className="size-4" aria-hidden="true" /> Save profile</Button>
      </form>
    </Section>
  );
}

function TimezoneSelect({ defaultValue, error }: { defaultValue: string; error?: string }) {
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [defaultValue];
  const list = zones.includes(defaultValue) ? zones : [defaultValue, ...zones];
  return (
    <div className="space-y-1.5">
      <label htmlFor="timezone" className="block text-sm font-medium text-fg-2">Time zone</label>
      <select id="timezone" name="timezone" defaultValue={defaultValue} className={selectClass} aria-invalid={error ? true : undefined}>
        {list.map((z) => (
          <option key={z} value={z}>{z.replaceAll("_", " ")}</option>
        ))}
      </select>
      {error && <p className="text-sm text-error">{error}</p>}
    </div>
  );
}

export function LearningForm({ profile }: { profile: ProfileRow }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveLearning, {});
  return (
    <Section id="learning" title="Learning preferences">
      <form action={action} className="space-y-5">
        <Messages state={state} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Daily study time (minutes)"
            name="daily_study_minutes"
            type="number"
            min={10}
            max={720}
            step={5}
            defaultValue={profile.daily_study_minutes}
            error={state.fields?.daily_study_minutes}
          />
          <div className="space-y-1.5">
            <label htmlFor="preferred_study_time" className="block text-sm font-medium text-fg-2">Preferred study time</label>
            <select id="preferred_study_time" name="preferred_study_time" defaultValue={profile.preferred_study_time ?? ""} className={selectClass}>
              <option value="">No preference</option>
              {STUDY_TIMES.map((t) => (
                <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Weekly goal (minutes)"
            name="weekly_goal_minutes"
            type="number"
            min={30}
            max={5040}
            step={15}
            defaultValue={profile.weekly_goal_minutes ?? 300}
            error={state.fields?.weekly_goal_minutes}
          />
          <TextField
            label="Weekly goal (study days)"
            name="weekly_goal_days"
            type="number"
            min={1}
            max={7}
            defaultValue={profile.weekly_goal_days ?? 5}
            error={state.fields?.weekly_goal_days}
          />
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-fg-2">Learning goals</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {[...new Set([...LEARNING_GOALS, ...profile.learning_goals])].map((g) => (
              <label key={g} className="flex items-center gap-3 rounded-xl border border-line bg-white/[0.03] px-3.5 py-2.5 text-sm">
                <input type="checkbox" name="learning_goals" value={g} defaultChecked={profile.learning_goals.includes(g)} className="size-4 accent-[#D6FF35]" />
                {g}
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" loading={pending}><Save className="size-4" aria-hidden="true" /> Save preferences</Button>
      </form>
    </Section>
  );
}

export function NotificationsForm({ prefs }: { prefs: NotificationPrefs }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveNotifications, {});
  const [daily, setDaily] = useState(prefs.daily_reminder);
  const rows: { key: keyof NotificationPrefs; label: string }[] = [
    { key: "sessions", label: "Upcoming sessions & unfinished tasks" },
    { key: "quizzes", label: "Quiz reminders" },
    { key: "streaks", label: "Streak notifications" },
    { key: "achievements", label: "Achievements" },
    { key: "plan_changes", label: "Study plan changes" },
    { key: "email", label: "Also email important reminders (once email delivery is enabled)" },
  ];
  return (
    <Section id="notifications" title="Notifications">
      <form action={action} className="space-y-3">
        <Messages state={state} />
        <label className="flex items-center justify-between gap-4 rounded-xl border border-line bg-white/[0.03] px-4 py-3 text-sm">
          Daily study reminder
          <input type="checkbox" name="daily_reminder" checked={daily} onChange={(e) => setDaily(e.target.checked)} className="size-5 accent-[#D6FF35]" />
        </label>
        {daily && (
          <TextField label="Reminder time (your time zone)" name="reminder_time" type="time" defaultValue={prefs.reminder_time} error={state.fields?.reminder_time} />
        )}
        {rows.map(({ key, label }) => (
          <label key={key} className="flex items-center justify-between gap-4 rounded-xl border border-line bg-white/[0.03] px-4 py-3 text-sm">
            {label}
            <input type="checkbox" name={key} defaultChecked={Boolean(prefs[key])} className="size-5 accent-[#D6FF35]" />
          </label>
        ))}
        <Button type="submit" loading={pending} className="mt-2"><Save className="size-4" aria-hidden="true" /> Save notifications</Button>
      </form>
    </Section>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<SettingsState, FormData>(changePassword, {});
  return (
    <Section id="security" title="Password">
      <form action={action} className="space-y-4" key={state.success}>
        <Messages state={state} />
        <PasswordField label="Current password" name="current" autoComplete="current-password" icon={<Lock className="size-[18px]" />} error={state.fields?.current} />
        <div className="grid gap-4 sm:grid-cols-2">
          <PasswordField label="New password" name="password" autoComplete="new-password" error={state.fields?.password} />
          <PasswordField label="Confirm new password" name="confirm" autoComplete="new-password" error={state.fields?.confirm} />
        </div>
        <Button type="submit" loading={pending}>Update password</Button>
      </form>
    </Section>
  );
}

export function DataForm() {
  const [state, action, pending] = useActionState<SettingsState, FormData>(deleteAccount, {});
  const [confirming, setConfirming] = useState(false);
  return (
    <Section id="privacy" title="Privacy & data">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white/[0.03] p-4">
          <div>
            <p className="font-medium">Export your data</p>
            <p className="text-sm text-fg-2">Download everything MindFlow stores about you as JSON.</p>
          </div>
          <a href="/api/account/export" className="focus-ring glass inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold hover:bg-white/10">
            <Download className="size-4" aria-hidden="true" /> Export
          </a>
        </div>
        <div className="rounded-2xl border border-error/30 bg-error/5 p-4">
          <p className="font-medium">Delete account</p>
          <p className="text-sm text-fg-2">
            Permanently deletes your account, materials, plans, notes and progress. This cannot be undone.
          </p>
          {!confirming ? (
            <Button type="button" variant="danger" size="sm" className="mt-3" onClick={() => setConfirming(true)}>
              <Trash2 className="size-4" aria-hidden="true" /> Delete my account
            </Button>
          ) : (
            <form action={action} className="mt-4 space-y-3">
              <FormMessage>{state.error}</FormMessage>
              <TextField label='Type "DELETE" to confirm' name="confirm" autoComplete="off" error={state.fields?.confirm} />
              <div className="flex gap-2">
                <Button type="submit" variant="danger" size="sm" loading={pending}>Permanently delete</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </Section>
  );
}
