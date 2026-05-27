/**
 * Export Service — generates Excel and PDF reports
 * Uses: xlsx (Excel), pdfkit (PDF)
 */
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const { Attendance, User, Task, Reimbursement } = require('../models');
const { Op } = require('sequelize');
const moment = require('moment');

// ─── Excel Exports ────────────────────────────────────────────────────────────

async function exportAttendanceExcel(startDate, endDate, userId = null) {
  const where = { date: { [Op.between]: [startDate, endDate] } };
  if (userId) where.userId = userId;

  const records = await Attendance.findAll({
    where,
    include: [{ model: User, as: 'employee', attributes: ['employeeId', 'firstName', 'lastName', 'department'] }],
    order: [['date', 'ASC']],
  });

  const rows = records.map(r => ({
    'Employee ID': r.employee?.employeeId,
    'Name': `${r.employee?.firstName} ${r.employee?.lastName}`,
    'Department': r.employee?.department,
    'Date': r.date,
    'Check In': r.checkInTime ? moment(r.checkInTime).format('HH:mm') : '-',
    'Check Out': r.checkOutTime ? moment(r.checkOutTime).format('HH:mm') : '-',
    'Working Hours': r.workingHours?.toFixed(2) || '0',
    'Status': r.status,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function exportReimbursementExcel(startDate, endDate) {
  const records = await Reimbursement.findAll({
    where: { createdAt: { [Op.between]: [startDate, endDate] } },
    include: [{ model: User, as: 'employee', attributes: ['employeeId', 'firstName', 'lastName', 'department'] }],
    order: [['createdAt', 'DESC']],
  });

  const rows = records.map(r => ({
    'Employee ID': r.employee?.employeeId,
    'Name': `${r.employee?.firstName} ${r.employee?.lastName}`,
    'Department': r.employee?.department,
    'Title': r.title,
    'Category': r.category,
    'Amount (₹)': r.amount,
    'Expense Date': r.expenseDate,
    'Status': r.status,
    'Submitted On': moment(r.createdAt).format('YYYY-MM-DD'),
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 18 }, { wch: 30 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Reimbursements');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ─── PDF Exports ──────────────────────────────────────────────────────────────

function generateAttendancePDF(records, options = {}) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    const buffers = [];
    doc.on('data', b => buffers.push(b));
    doc.on('end', () => resolve(Buffer.concat(buffers)));

    // Header
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#1A73E8').text('Company App', 40, 40);
    doc.font('Helvetica').fontSize(12).fillColor('#333').text('Attendance Report', 40, 65);
    doc.text(`Period: ${options.startDate || ''} to ${options.endDate || ''}`, 40, 82);
    doc.moveTo(40, 100).lineTo(800, 100).stroke('#E2E8F0');

    // Table header
    const cols = [60, 160, 260, 350, 420, 490, 560, 640];
    const headers = ['Emp ID', 'Name', 'Department', 'Date', 'Check In', 'Check Out', 'Hours', 'Status'];

    doc.y = 115;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#1A73E8');
    headers.forEach((h, i) => doc.text(h, cols[i], doc.y, { width: 80 }));

    doc.moveTo(40, doc.y + 14).lineTo(800, doc.y + 14).stroke('#E2E8F0');
    doc.y += 20;

    // Table rows
    doc.font('Helvetica').fontSize(8).fillColor('#333');
    records.forEach((r, idx) => {
      if (idx % 2 === 0) {
        doc.rect(40, doc.y - 4, 760, 16).fillAndStroke('#F8FAFC', '#F8FAFC');
        doc.fillColor('#333');
      }
      const vals = [
        r.employee?.employeeId || '', `${r.employee?.firstName || ''} ${r.employee?.lastName || ''}`,
        r.employee?.department || '', r.date || '',
        r.checkInTime ? moment(r.checkInTime).format('HH:mm') : '-',
        r.checkOutTime ? moment(r.checkOutTime).format('HH:mm') : '-',
        r.workingHours?.toFixed(2) || '0', r.status || '',
      ];
      vals.forEach((v, i) => doc.text(v, cols[i], doc.y, { width: 90, ellipsis: true }));
      doc.y += 16;
      if (doc.y > 540) { doc.addPage({ layout: 'landscape' }); doc.y = 40; }
    });

    doc.end();
  });
}

module.exports = { exportAttendanceExcel, exportReimbursementExcel, generateAttendancePDF };
