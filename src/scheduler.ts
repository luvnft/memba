import { db } from './db';
import { addMilliseconds, differenceInMilliseconds } from 'date-fns';
import twilio from 'twilio';
import env from './env';

type Reminder = {
  user: {
    phone: string;
  };
  id: string;
  text: string;
  time: Date;
};

/** The difference in milliseconds between each schedule */
const SCHEDULE_DIFFERENCE_MS = 1 * 60 * 1000; // 1 minute
const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

/** Starts the reminder scheduler */
export function startScheduler() {
  console.log(
    `[rembo] starting reminder scheduler with ${SCHEDULE_DIFFERENCE_MS}ms difference`,
  );
  (async () => {
    await findAndScheduleReminders();
  })();
  setInterval(findAndScheduleReminders, SCHEDULE_DIFFERENCE_MS);
}

/** Finds and schedules reminders */
async function findAndScheduleReminders() {
  const now = new Date();

  // the window of time to check for reminders is only 1 minute long.
  const windowStart = addMilliseconds(now, SCHEDULE_DIFFERENCE_MS);
  const windowEnd = addMilliseconds(now, SCHEDULE_DIFFERENCE_MS + 60 * 1000);

  console.log(
    `[rembo] @"${now.toUTCString()}" checking messages between "${windowStart.toUTCString()}" and "${windowEnd.toUTCString()}"`,
  );
  const reminders: Reminder[] = await db.reminder.findMany({
    where: {
      AND: [
        {
          time: {
            gte: windowStart,
          },
        },
        {
          time: {
            lte: windowEnd,
          },
        },
      ],
    },
    select: {
      id: true,
      time: true,
      text: true,
      user: {
        select: {
          phone: true,
        },
      },
    },
  });

  console.log(`[rembo] found  ${reminders.length} reminders`);
  reminders.forEach((reminder) => {
    scheduleReminder(reminder, now);
  });
}

/** Schedules a reminder to be sent */
function scheduleReminder(reminder: Reminder, now: Date) {
  if (reminder.time < now) {
    console.log(
      `[rembo] reminder ${reminder.id} is in the past, skipping scheduling`,
    );
    return;
  }

  const firingTime = differenceInMilliseconds(reminder.time, now);

  console.log(
    `[rembo] scheduling reminder ${reminder.text} in ${firingTime / 1000}s`,
  );
  setTimeout(
    async () => {
      try {
        const res = await client.messages.create({
          body: reminder.text,
          from: env.TWILIO_PHONE_NUMBER,
          to: reminder.user.phone,
        });
        console.log(
          `[rembo] sent sms from scheduler: ${JSON.stringify(
            {
              responseBody: res.body,
              reminder: reminder,
            },
            null,
            2,
          )}`,
        );
      } catch (e) {
        console.log(
          `[rembo] error sending sms from scheduler: ${JSON.stringify(
            {
              error: e,
              reminder: reminder,
            },
            null,
            2,
          )}`,
        );
      }
    },
    differenceInMilliseconds(reminder.time, now),
  );
}
