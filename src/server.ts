import { app } from './app.js';
import { env } from './config/env.js';
import mongoose from 'mongoose';
import { User } from './models/User.js';
import { Todo } from './models/Todo.js';
import { DiaryEntry } from './models/DiaryEntry.js';
import { FinanceAccount } from './models/FinanceAccount.js';
import { FinanceBudget } from './models/FinanceBudget.js';
import { FinanceCategory } from './models/FinanceCategory.js';
import { FinanceTransaction } from './models/FinanceTransaction.js';
import { CalendarEvent } from './models/CalendarEvent.js';
import { MalayalamCalendarPage } from './models/MalayalamCalendarPage.js';
import { LeaveType } from './models/LeaveType.js';
import { LeavePolicy } from './models/LeavePolicy.js';
import { CompanyHoliday } from './models/CompanyHoliday.js';
import { LeaveRecord } from './models/LeaveRecord.js';

try {
  await mongoose.connect(env.MONGODB_URI);
  await Promise.all([User.init(), Todo.init(), DiaryEntry.init(), FinanceAccount.init(), FinanceBudget.init(), FinanceCategory.init(), FinanceTransaction.init(), CalendarEvent.init(), MalayalamCalendarPage.init(), LeaveType.init(), LeavePolicy.init(), CompanyHoliday.init(), LeaveRecord.init()]);
  app.listen(env.PORT, () => console.log(`API listening on http://localhost:${env.PORT}`));
} catch {
  console.error('Unable to connect to MongoDB. Check the connection string and Atlas network access.');
  process.exitCode = 1;
}
