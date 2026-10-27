import 'dotenv/config';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose, { Types } from 'mongoose';
import { CompanyHoliday } from '../models/CompanyHoliday.js';
import { LeavePolicy } from '../models/LeavePolicy.js';
import { LeaveRecord } from '../models/LeaveRecord.js';
import { LeaveType } from '../models/LeaveType.js';
import { companyHolidaySchema, leavePolicySchema, leaveRecordSchema } from '../validation/leave.schemas.js';
import { createCompanyHoliday, createLeaveRecord, createLeaveType, deleteCompanyHoliday, deleteLeaveRecord, deleteLeaveType, getCompanyHolidaysForCalendar, getLeaveDashboard, updateCompanyHoliday, updateLeaveRecord, updateLeaveType } from './leave.service.js';

const users = [new Types.ObjectId().toHexString(), new Types.ObjectId().toHexString()];
let connected = false;
before(async () => {
  assert.ok(process.env.MONGODB_URI, 'Set MONGODB_URI in backend/.env before running leave integration tests.');
  await mongoose.connect(process.env.MONGODB_URI); connected = true;
  await Promise.all([LeaveType.init(), LeavePolicy.init(), CompanyHoliday.init(), LeaveRecord.init()]);
});
after(async () => {
  if (!connected) return;
  await Promise.all(users.map(async (userId) => Promise.all([LeaveType.deleteMany({ userId }), LeavePolicy.deleteMany({ userId }), CompanyHoliday.deleteMany({ userId }), LeaveRecord.deleteMany({ userId })])));
  await mongoose.disconnect();
});

const holidayData = (fields: Record<string, unknown> = {}) => ({ title: 'Office closed', dateKey: '2026-11-06', notes: '', ...fields });
const recordData = (leaveTypeId: string, fields: Record<string, unknown> = {}) => ({ leaveTypeId, startDate: '2026-11-06', endDate: '2026-11-09', halfDay: false, status: 'planned', note: '', ...fields });

test('leave validation rejects invalid dates, reversed ranges and ambiguous half-day spans', () => {
  assert.equal(companyHolidaySchema.safeParse(holidayData()).success, true);
  assert.equal(companyHolidaySchema.safeParse(holidayData({ dateKey: '2026-02-30' })).success, false);
  assert.equal(leaveRecordSchema.safeParse(recordData(new Types.ObjectId().toHexString())).success, true);
  assert.equal(leaveRecordSchema.safeParse(recordData(new Types.ObjectId().toHexString(), { endDate: '2026-11-05' })).success, false);
  assert.equal(leaveRecordSchema.safeParse(recordData(new Types.ObjectId().toHexString(), { halfDay: true })).success, false);
  assert.equal(leavePolicySchema.safeParse({ workingDaysOfWeek: [1, 1], excludeCompanyHolidays: true }).success, false);
});

test('policy controls weekend and company-holiday counting; planned and cancelled balances are distinct', async () => {
  const userId = users[0]!;
  const dashboard = await getLeaveDashboard(userId, 2026, 11);
  const annual = dashboard.types.find((type) => type.name === 'Annual / earned leave');
  assert.ok(annual);
  const updatedType = await updateLeaveType(userId, String(annual._id), { name: annual.name, color: 'teal', entitlementDays: 2, active: true });
  assert.equal(updatedType.entitlementHalfDays, 4);
  const custom = await createLeaveType(userId, { name: 'Study leave', color: 'violet', entitlementDays: 1.5, active: true });
  assert.equal(custom.entitlementHalfDays, 3);
  const customRecord = await createLeaveRecord(userId, leaveRecordSchema.parse(recordData(String(custom._id), { startDate: '2026-11-12', endDate: '2026-11-12' })));
  await assert.rejects(deleteLeaveType(userId, String(custom._id)), (error: { status: number }) => error.status === 409);

  await LeavePolicy.findOneAndUpdate({ userId }, { workingDaysOfWeek: [1, 2, 5], excludeCompanyHolidays: true });
  const holiday = await createCompanyHoliday(userId, holidayData());
  const leave = await createLeaveRecord(userId, leaveRecordSchema.parse(recordData(String(annual._id))));
  const summary = await getLeaveDashboard(userId, 2026, 11);
  const balance = summary.balanceByType.find((item) => item.leaveTypeId === String(annual._id));
  assert.equal(balance?.plannedHalfDays, 2, 'Friday is a holiday and Sat/Sun are non-workdays, so only Monday is charged');
  assert.equal(balance?.remainingHalfDays, 2, 'planned leave reserves the balance');
  assert.equal(summary.yearlySummary.plannedHalfDays, 2);
  assert.equal(summary.monthlySummary.plannedHalfDays, 2);
  assert.equal((await getCompanyHolidaysForCalendar(userId, new Date('2026-11-01T00:00:00Z'), new Date('2026-12-01T00:00:00Z'), 'Asia/Kolkata')).length, 1);
  assert.equal((await getCompanyHolidaysForCalendar(users[1]!, new Date('2026-11-01T00:00:00Z'), new Date('2026-12-01T00:00:00Z'), 'Asia/Kolkata')).length, 0);

  await assert.rejects(createLeaveRecord(userId, leaveRecordSchema.parse(recordData(String(annual._id), { startDate: '2026-11-09', endDate: '2026-11-10' }))), (error: { status: number }) => error.status === 409);
  const cancelledOverlap = await createLeaveRecord(userId, leaveRecordSchema.parse(recordData(String(annual._id), { status: 'cancelled' })));
  assert.ok(cancelledOverlap);
  const updatedLeave = await updateLeaveRecord(userId, String(leave._id), leaveRecordSchema.parse(recordData(String(annual._id), { status: 'taken' })));
  assert.equal(updatedLeave.status, 'taken');
  await updateLeaveRecord(userId, String(leave._id), leaveRecordSchema.parse(recordData(String(annual._id), { status: 'cancelled' })));
  await deleteLeaveRecord(userId, String(cancelledOverlap._id));
  const half = await createLeaveRecord(userId, leaveRecordSchema.parse(recordData(String(annual._id), { startDate: '2026-11-10', endDate: '2026-11-10', halfDay: true, halfDayPeriod: 'afternoon', status: 'taken' })));
  const finalSummary = await getLeaveDashboard(userId, 2026, 11);
  const finalBalance = finalSummary.balanceByType.find((item) => item.leaveTypeId === String(annual._id));
  assert.equal(finalBalance?.takenHalfDays, 1, 'half-day is one half-day unit');
  assert.equal(finalBalance?.plannedHalfDays, 0);
  assert.equal(finalBalance?.cancelledHalfDays, 2, 'cancelled full-day range remains visible in summaries but does not consume balance');
  assert.equal(finalBalance?.remainingHalfDays, 3);
  await deleteLeaveRecord(userId, String(half._id));
  await deleteLeaveRecord(userId, String(customRecord._id));
  const changedHoliday = await updateCompanyHoliday(userId, String(holiday._id), holidayData({ title: 'Updated closure', dateKey: '2026-11-07' }));
  assert.equal(changedHoliday.title, 'Updated closure');
  await deleteCompanyHoliday(userId, String(holiday._id));
});

test('leave records and company holidays cannot be read, edited, or deleted by another owner', async () => {
  const owner = users[0]!; const other = users[1]!;
  const dashboard = await getLeaveDashboard(owner, 2026, 12);
  const type = dashboard.types.find((item) => item.active)!;
  const holiday = await createCompanyHoliday(owner, holidayData({ dateKey: '2026-12-25', title: 'Winter closure' }));
  const leave = await createLeaveRecord(owner, leaveRecordSchema.parse(recordData(String(type._id), { startDate: '2026-12-28', endDate: '2026-12-28' })));
  assert.equal((await getLeaveDashboard(other, 2026, 12)).leaveRecords.length, 0);
  await assert.rejects(updateCompanyHoliday(other, String(holiday._id), holidayData()), (error: { status: number }) => error.status === 404);
  await assert.rejects(deleteCompanyHoliday(other, String(holiday._id)), (error: { status: number }) => error.status === 404);
  await assert.rejects(updateLeaveRecord(other, String(leave._id), leaveRecordSchema.parse(recordData(String(type._id), { startDate: '2026-12-28', endDate: '2026-12-28' }))), (error: { status: number }) => error.status === 404);
  await assert.rejects(deleteLeaveRecord(other, String(leave._id)), (error: { status: number }) => error.status === 404);
  await deleteCompanyHoliday(owner, String(holiday._id)); await deleteLeaveRecord(owner, String(leave._id));
});
