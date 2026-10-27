import mongoose from 'mongoose';
import type { z } from 'zod';
import { CompanyHoliday } from '../models/CompanyHoliday.js';
import { LeavePolicy } from '../models/LeavePolicy.js';
import { LeaveRecord } from '../models/LeaveRecord.js';
import { LeaveType } from '../models/LeaveType.js';
import type { companyHolidaySchema, leavePolicySchema, leaveRecordSchema, leaveTypeSchema } from '../validation/leave.schemas.js';
import { HttpError } from './todo.service.js';

type TypeInput = z.infer<typeof leaveTypeSchema>;
type PolicyInput = z.infer<typeof leavePolicySchema>;
type HolidayInput = z.infer<typeof companyHolidaySchema>;
type RecordInput = z.infer<typeof leaveRecordSchema>;
type LeaveRow = { leaveTypeId: unknown; startDate: string; endDate: string; halfDay: boolean; status: 'planned' | 'taken' | 'cancelled' };
const defaultTypes = [
  { name: 'Annual / earned leave', normalizedName: 'annual / earned leave', color: 'teal' },
  { name: 'Casual leave', normalizedName: 'casual leave', color: 'blue' },
  { name: 'Sick leave', normalizedName: 'sick leave', color: 'rose' },
  { name: 'Unpaid leave', normalizedName: 'unpaid leave', color: 'violet' }
] as const;
const userLocks = new Map<string, Promise<void>>();

async function withUserLock<T>(userId: string, action: () => Promise<T>): Promise<T> {
  const previous = userLocks.get(userId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => gate);
  userLocks.set(userId, tail);
  await previous;
  try { return await action(); }
  finally { release(); if (userLocks.get(userId) === tail) userLocks.delete(userId); }
}

export async function ensureLeaveDefaults(userId: string) {
  const user = new mongoose.Types.ObjectId(userId);
  const policy = await LeavePolicy.findOneAndUpdate({ userId: user }, { $setOnInsert: { workingDaysOfWeek: [1, 2, 3, 4, 5], excludeCompanyHolidays: true } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  const types = await Promise.all(defaultTypes.map((type) => LeaveType.findOneAndUpdate({ userId: user, normalizedName: type.normalizedName }, { $setOnInsert: { ...type, userId: user, entitlementHalfDays: 0, active: true, isDefault: true } }, { upsert: true, new: true, setDefaultsOnInsert: true })));
  return { policy, types };
}

function validId(id: string, item: string) { if (!mongoose.isValidObjectId(id)) throw new HttpError(404, `${item.toUpperCase()}_NOT_FOUND`, `${item} not found.`); }
function toDateKey(date: Date, timezone: string) {
  const items = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (key: string) => items.find((item) => item.type === key)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function addDays(key: string, number: number) { const [year, month, day] = key.split('-').map(Number); const date = new Date(Date.UTC(year!, month! - 1, day! + number)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`; }
function inclusiveDates(startDate: string, endDate: string) { const days: string[] = []; for (let date = startDate; date <= endDate && days.length <= 366; date = addDays(date, 1)) days.push(date); return days; }
function chargedUnits(record: Pick<LeaveRow, 'startDate' | 'endDate' | 'halfDay' | 'status'>, policy: { workingDaysOfWeek: number[]; excludeCompanyHolidays: boolean }, holidays: Set<string>) {
  const days = inclusiveDates(String(record.startDate), String(record.endDate));
  return days.reduce((units, date) => {
    const [year, month, day] = date.split('-').map(Number);
    const weekday = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay();
    if (!policy.workingDaysOfWeek.includes(weekday) || (policy.excludeCompanyHolidays && holidays.has(date))) return units;
    return units + (record.halfDay ? 1 : 2);
  }, 0);
}
function emptySummary() { return { takenHalfDays: 0, plannedHalfDays: 0, cancelledHalfDays: 0 }; }
function summaryFor(records: LeaveRow[], policy: { workingDaysOfWeek: number[]; excludeCompanyHolidays: boolean }, holidays: Set<string>, start: string, end: string) {
  const result = emptySummary();
  for (const record of records) {
    if (record.startDate > end || record.endDate < start) continue;
    const visibleStart = record.startDate < start ? start : record.startDate;
    const visibleEnd = record.endDate > end ? end : record.endDate;
    if (record.halfDay && (visibleStart !== record.startDate || visibleEnd !== record.endDate)) continue;
    const units = chargedUnits({ ...record, startDate: visibleStart, endDate: visibleEnd }, policy, holidays);
    if (record.status === 'taken') result.takenHalfDays += units;
    else if (record.status === 'planned') result.plannedHalfDays += units;
    else result.cancelledHalfDays += units;
  }
  return result;
}

export async function getLeaveDashboard(userId: string, year: number, month: number, today = new Date().toISOString().slice(0, 10)) {
  const { policy } = await ensureLeaveDefaults(userId);
  const yearStart = `${year}-01-01`; const yearEnd = `${year}-12-31`;
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEndDay = new Date(Date.UTC(year, month, 0)).getUTCDate(); const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(monthEndDay).padStart(2, '0')}`;
  const [types, holidays, records] = await Promise.all([
    LeaveType.find({ userId }).sort({ active: -1, createdAt: 1 }).lean(),
    CompanyHoliday.find({ userId, dateKey: { $gte: yearStart, $lte: yearEnd } }).sort({ dateKey: 1 }).lean(),
    LeaveRecord.find({ userId, startDate: { $lte: yearEnd }, endDate: { $gte: yearStart } }).populate('leaveTypeId', 'name color active isDefault entitlementHalfDays').sort({ startDate: -1, createdAt: -1 }).limit(2000).lean()
  ]);
  const holidayDates = new Set(holidays.map((holiday) => holiday.dateKey));
  const policyView = { workingDaysOfWeek: policy.workingDaysOfWeek, excludeCompanyHolidays: policy.excludeCompanyHolidays };
  const balanceByType = types.map((type) => {
    const matching = records.filter((record) => {
      const typeRef: unknown = record.leaveTypeId;
      const recordTypeId = typeRef && typeof typeRef === 'object' && '_id' in typeRef ? String(typeRef._id) : String(typeRef);
      return recordTypeId === String(type._id);
    });
    const summary = summaryFor(matching as unknown as LeaveRow[], policyView, holidayDates, yearStart, yearEnd);
    const entitledHalfDays = type.entitlementHalfDays;
    return { leaveTypeId: String(type._id), name: type.name, color: type.color, active: type.active, entitledHalfDays, ...summary, remainingHalfDays: entitledHalfDays - summary.takenHalfDays - summary.plannedHalfDays };
  });
  const upcomingHolidays = await CompanyHoliday.find({ userId, dateKey: { $gte: today } }).sort({ dateKey: 1 }).limit(8).lean();
  return {
    year, month, policy: policyView, types, holidays, leaveRecords: records,
    balanceByType,
    yearlySummary: summaryFor(records as unknown as LeaveRow[], policyView, holidayDates, yearStart, yearEnd),
    monthlySummary: summaryFor(records as unknown as LeaveRow[], policyView, holidayDates, monthStart, monthEnd),
    upcomingHolidays
  };
}

export async function saveLeavePolicy(userId: string, input: PolicyInput) {
  await ensureLeaveDefaults(userId);
  return LeavePolicy.findOneAndUpdate({ userId }, input, { new: true, runValidators: true });
}
export async function createLeaveType(userId: string, input: TypeInput) {
  await ensureLeaveDefaults(userId);
  return LeaveType.create({ ...input, userId, normalizedName: input.name.toLocaleLowerCase(), entitlementHalfDays: Math.round(input.entitlementDays * 2), isDefault: false });
}
export async function updateLeaveType(userId: string, id: string, input: TypeInput) {
  validId(id, 'leave_type');
  const type = await LeaveType.findOneAndUpdate({ _id: id, userId }, { ...input, normalizedName: input.name.toLocaleLowerCase(), entitlementHalfDays: Math.round(input.entitlementDays * 2) }, { new: true, runValidators: true });
  if (!type) throw new HttpError(404, 'LEAVE_TYPE_NOT_FOUND', 'Leave type not found.');
  return type;
}
export async function deleteLeaveType(userId: string, id: string) {
  validId(id, 'leave_type');
  if (await LeaveRecord.exists({ userId, leaveTypeId: id })) throw new HttpError(409, 'LEAVE_TYPE_IN_USE', 'This leave type has history. Deactivate it instead of deleting it.');
  const type = await LeaveType.findOne({ _id: id, userId });
  if (!type) throw new HttpError(404, 'LEAVE_TYPE_NOT_FOUND', 'Leave type not found.');
  if (type.isDefault) throw new HttpError(409, 'DEFAULT_LEAVE_TYPE', 'Built-in leave types cannot be removed. Deactivate the type instead.');
  const result = await LeaveType.deleteOne({ _id: id, userId });
  if (!result.deletedCount) throw new HttpError(404, 'LEAVE_TYPE_NOT_FOUND', 'Leave type not found.');
  return { deleted: true };
}
export async function deactivateLeaveType(userId: string, id: string) {
  validId(id, 'leave_type');
  const type = await LeaveType.findOneAndUpdate({ _id: id, userId }, { active: false }, { new: true });
  if (!type) throw new HttpError(404, 'LEAVE_TYPE_NOT_FOUND', 'Leave type not found.');
  return type;
}

export async function createCompanyHoliday(userId: string, input: HolidayInput) { return CompanyHoliday.create({ ...input, userId }); }
export async function updateCompanyHoliday(userId: string, id: string, input: HolidayInput) {
  validId(id, 'holiday');
  const holiday = await CompanyHoliday.findOneAndUpdate({ _id: id, userId }, input, { new: true, runValidators: true });
  if (!holiday) throw new HttpError(404, 'HOLIDAY_NOT_FOUND', 'Company holiday not found.');
  return holiday;
}
export async function deleteCompanyHoliday(userId: string, id: string) {
  validId(id, 'holiday');
  const result = await CompanyHoliday.deleteOne({ _id: id, userId });
  if (!result.deletedCount) throw new HttpError(404, 'HOLIDAY_NOT_FOUND', 'Company holiday not found.');
  return { deleted: true };
}
export async function getCompanyHolidaysForCalendar(userId: string, from: Date, to: Date, timezone: string) {
  const fromKey = toDateKey(from, timezone); const toKey = toDateKey(new Date(to.getTime() - 1), timezone);
  const holidays = await CompanyHoliday.find({ userId, dateKey: { $gte: fromKey, $lte: toKey } }).sort({ dateKey: 1 }).lean();
  return holidays.map((holiday) => ({ id: String(holiday._id), title: holiday.title, date: holiday.dateKey }));
}

export async function createLeaveRecord(userId: string, input: RecordInput) {
  return withUserLock(userId, async () => {
    const type = await LeaveType.findOne({ _id: input.leaveTypeId, userId, active: true });
    if (!type) throw new HttpError(400, 'LEAVE_TYPE_NOT_FOUND', 'Choose an active leave type.');
    if (input.status !== 'cancelled' && await LeaveRecord.exists({ userId, status: { $ne: 'cancelled' }, startDate: { $lte: input.endDate }, endDate: { $gte: input.startDate } })) throw new HttpError(409, 'LEAVE_OVERLAP', 'This range overlaps another active leave record. Edit or cancel the existing record first.');
    return LeaveRecord.create({ ...input, userId, leaveTypeId: type._id });
  });
}
export async function updateLeaveRecord(userId: string, id: string, input: RecordInput) {
  validId(id, 'leave_record');
  return withUserLock(userId, async () => {
    const existing = await LeaveRecord.findOne({ _id: id, userId });
    if (!existing) throw new HttpError(404, 'LEAVE_RECORD_NOT_FOUND', 'Leave record not found.');
    const type = await LeaveType.findOne({ _id: input.leaveTypeId, userId });
    if (!type || (!type.active && String(type._id) !== String(existing.leaveTypeId))) throw new HttpError(400, 'LEAVE_TYPE_NOT_FOUND', 'Choose an active leave type.');
    if (input.status !== 'cancelled' && await LeaveRecord.exists({ _id: { $ne: id }, userId, status: { $ne: 'cancelled' }, startDate: { $lte: input.endDate }, endDate: { $gte: input.startDate } })) throw new HttpError(409, 'LEAVE_OVERLAP', 'This range overlaps another active leave record. Edit or cancel the existing record first.');
    existing.set({ ...input, leaveTypeId: type._id });
    return existing.save();
  });
}
export async function deleteLeaveRecord(userId: string, id: string) {
  validId(id, 'leave_record');
  const result = await LeaveRecord.deleteOne({ _id: id, userId });
  if (!result.deletedCount) throw new HttpError(404, 'LEAVE_RECORD_NOT_FOUND', 'Leave record not found.');
  return { deleted: true };
}
