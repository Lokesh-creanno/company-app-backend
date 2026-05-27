const User = require('./User');
const Attendance = require('./Attendance');
const Task = require('./Task');
const Reimbursement = require('./Reimbursement');
const Document = require('./Document');
const Notification = require('./Notification');

// User self-reference (manager)
User.hasMany(User, { foreignKey: 'managerId', as: 'reportees' });
User.belongsTo(User, { foreignKey: 'managerId', as: 'manager' });

// Attendance
User.hasMany(Attendance, { foreignKey: 'userId' });
Attendance.belongsTo(User, { foreignKey: 'userId', as: 'employee' });

// Tasks
User.hasMany(Task, { foreignKey: 'assignedTo', as: 'assignedTasks' });
User.hasMany(Task, { foreignKey: 'assignedBy', as: 'createdTasks' });
Task.belongsTo(User, { foreignKey: 'assignedTo', as: 'assignee' });
Task.belongsTo(User, { foreignKey: 'assignedBy', as: 'creator' });

// Reimbursements
User.hasMany(Reimbursement, { foreignKey: 'userId' });
Reimbursement.belongsTo(User, { foreignKey: 'userId', as: 'employee' });
Reimbursement.belongsTo(User, { foreignKey: 'approvedBy', as: 'approver' });

// Documents
User.hasMany(Document, { foreignKey: 'userId' });
Document.belongsTo(User, { foreignKey: 'userId', as: 'owner' });

// Notifications
User.hasMany(Notification, { foreignKey: 'userId' });
Notification.belongsTo(User, { foreignKey: 'userId' });

module.exports = { User, Attendance, Task, Reimbursement, Document, Notification };
