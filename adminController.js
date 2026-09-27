const db = require('../config/db');
const { ApiError } = require('../middleware/errorHandler');

async function logAction(adminId, action, targetUserId, reportId, notes) {
  await db.query(
    `INSERT INTO admin_actions (admin_id, action, target_user_id, report_id, notes) VALUES ($1,$2,$3,$4,$5)`,
    [adminId, action, targetUserId || null, reportId || null, notes || null]
  );
}

// GET /api/admin/dashboard
async function dashboard(req, res, next) {
  try {
    const [totalUsers, activeUsers, callsToday, premiumUsers, pendingReports, bannedUsers] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM users`),
      db.query(`SELECT COUNT(*) FROM users WHERE status = 'active'`),
      db.query(`SELECT COUNT(*) FROM call_sessions WHERE started_at >= CURRENT_DATE`),
      db.query(`SELECT COUNT(*) FROM users WHERE is_premium = true`),
      db.query(`SELECT COUNT(*) FROM reports WHERE status = 'pending'`),
      db.query(`SELECT COUNT(*) FROM users WHERE status = 'banned'`),
    ]);
    res.json({
      success: true,
      data: {
        totalUsers: Number(totalUsers.rows[0].count),
        activeUsers: Number(activeUsers.rows[0].count),
        callsToday: Number(callsToday.rows[0].count),
        premiumUsers: Number(premiumUsers.rows[0].count),
        pendingReports: Number(pendingReports.rows[0].count),
        bannedUsers: Number(bannedUsers.rows[0].count),
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/users?search=
async function listUsers(req, res, next) {
  try {
    const search = req.query.search || '';
    const { rows } = await db.query(
      `SELECT u.id, u.phone_number, u.status, u.is_premium, u.created_at, p.display_name
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.phone_number ILIKE $1 OR p.display_name ILIKE $1
       ORDER BY u.created_at DESC LIMIT 100`,
      [`%${search}%`]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/reports?status=pending
async function listReports(req, res, next) {
  try {
    const status = req.query.status || 'pending';
    const { rows } = await db.query(
      `SELECT r.*, ru.phone_number AS reported_phone, rp.phone_number AS reporter_phone
       FROM reports r
       JOIN users ru ON ru.id = r.reported_user_id
       JOIN users rp ON rp.id = r.reporter_id
       WHERE r.status = $1
       ORDER BY r.created_at DESC LIMIT 100`,
      [status]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/users/:id/suspend
async function suspendUser(req, res, next) {
  try {
    await db.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [req.params.id]);
    await logAction(req.user.id, 'suspend', req.params.id, null, req.body.notes);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/users/:id/ban
async function banUser(req, res, next) {
  try {
    await db.query(`UPDATE users SET status = 'banned' WHERE id = $1`, [req.params.id]);
    await logAction(req.user.id, 'ban', req.params.id, null, req.body.notes);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/users/:id/unban
async function unbanUser(req, res, next) {
  try {
    await db.query(`UPDATE users SET status = 'active' WHERE id = $1`, [req.params.id]);
    await logAction(req.user.id, 'unban', req.params.id, null, req.body.notes);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/reports/:id/resolve
async function resolveReport(req, res, next) {
  try {
    const { status } = req.body; // 'resolved' | 'dismissed' | 'under_review'
    await db.query(`UPDATE reports SET status = $1 WHERE id = $2`, [status, req.params.id]);
    await logAction(req.user.id, `report_${status}`, null, req.params.id, req.body.notes);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { dashboard, listUsers, listReports, suspendUser, banUser, unbanUser, resolveReport };
