import type { Request, Response } from 'express';
import { companyHolidaySchema, leaveDashboardQuerySchema, leavePolicySchema, leaveRecordSchema, leaveTypeSchema } from '../validation/leave.schemas.js';
import {
  createCompanyHoliday, createLeaveRecord, createLeaveType, deleteCompanyHoliday, deleteLeaveRecord,
  deleteLeaveType, getLeaveDashboard, saveLeavePolicy, updateCompanyHoliday, updateLeaveRecord, updateLeaveType
} from '../services/leave.service.js';
import { HttpError } from '../services/todo.service.js';

const owner = (request: Request) => request.session.user!.id;
const idParam = (request: Request) => {
  const { id } = request.params;
  if (typeof id !== 'string') throw new HttpError(404, 'NOT_FOUND', 'Leave item not found.');
  return id;
};
function invalid(message: string) { return new HttpError(400, 'VALIDATION_ERROR', message); }

export async function getDashboard(request: Request, response: Response) {
  const parsed = leaveDashboardQuerySchema.safeParse(request.query);
  if (!parsed.success) throw invalid(parsed.error.issues[0]?.message ?? 'Invalid dashboard period.');
  response.json({ success: true, data: await getLeaveDashboard(owner(request), parsed.data.year, parsed.data.month, parsed.data.today) });
}
export async function putPolicy(request: Request, response: Response) {
  const parsed = leavePolicySchema.safeParse(request.body);
  if (!parsed.success) throw invalid(parsed.error.issues[0]?.message ?? 'Invalid leave policy.');
  response.json({ success: true, data: { policy: await saveLeavePolicy(owner(request), parsed.data) } });
}
export async function postLeaveType(request: Request, response: Response) {
  const parsed = leaveTypeSchema.safeParse(request.body);
  if (!parsed.success) throw invalid(parsed.error.issues[0]?.message ?? 'Invalid leave type.');
  response.status(201).json({ success: true, data: { type: await createLeaveType(owner(request), parsed.data) } });
}
export async function patchLeaveType(request: Request, response: Response) {
  const parsed = leaveTypeSchema.safeParse(request.body);
  if (!parsed.success) throw invalid(parsed.error.issues[0]?.message ?? 'Invalid leave type.');
  response.json({ success: true, data: { type: await updateLeaveType(owner(request), idParam(request), parsed.data) } });
}
export async function removeLeaveType(request: Request, response: Response) { response.json({ success: true, data: await deleteLeaveType(owner(request), idParam(request)) }); }

export async function postHoliday(request: Request, response: Response) {
  const parsed = companyHolidaySchema.safeParse(request.body);
  if (!parsed.success) throw invalid(parsed.error.issues[0]?.message ?? 'Invalid company holiday.');
  response.status(201).json({ success: true, data: { holiday: await createCompanyHoliday(owner(request), parsed.data) } });
}
export async function patchHoliday(request: Request, response: Response) {
  const parsed = companyHolidaySchema.safeParse(request.body);
  if (!parsed.success) throw invalid(parsed.error.issues[0]?.message ?? 'Invalid company holiday.');
  response.json({ success: true, data: { holiday: await updateCompanyHoliday(owner(request), idParam(request), parsed.data) } });
}
export async function removeHoliday(request: Request, response: Response) { response.json({ success: true, data: await deleteCompanyHoliday(owner(request), idParam(request)) }); }

export async function postLeaveRecord(request: Request, response: Response) {
  const parsed = leaveRecordSchema.safeParse(request.body);
  if (!parsed.success) throw invalid(parsed.error.issues[0]?.message ?? 'Invalid leave record.');
  response.status(201).json({ success: true, data: { leave: await createLeaveRecord(owner(request), parsed.data) } });
}
export async function patchLeaveRecord(request: Request, response: Response) {
  const parsed = leaveRecordSchema.safeParse(request.body);
  if (!parsed.success) throw invalid(parsed.error.issues[0]?.message ?? 'Invalid leave record.');
  response.json({ success: true, data: { leave: await updateLeaveRecord(owner(request), idParam(request), parsed.data) } });
}
export async function removeLeaveRecord(request: Request, response: Response) { response.json({ success: true, data: await deleteLeaveRecord(owner(request), idParam(request)) }); }
