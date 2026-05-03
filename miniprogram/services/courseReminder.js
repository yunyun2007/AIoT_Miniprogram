const { calculateDistance } = require('../utils/distance.js');

// 课前多少分钟提醒
const REMINDER_MINUTES = 20;

class CourseReminderService {
  constructor(callbacks) {
    this.callbacks = callbacks; // { onReminder, onDismiss }
    this.timer = null;
    this.remindedCourseId = null; // 已提醒过的课程ID，避免重复
    this.currentCourse = null; // 当前提醒的课程
  }

  // 启动定时检查
  start() {
    // 立即检查一次
    this.checkUpcomingCourses();
    // 每60秒检查
    this.timer = setInterval(() => {
      this.checkUpcomingCourses();
    }, 60000);
  }

  // 停止服务
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.remindedCourseId = null;
    this.currentCourse = null;
  }

  // 核心检查逻辑
  checkUpcomingCourses() {
    const now = new Date();
    const currentDay = now.getDay() === 0 ? 6 : now.getDay() - 1; // 周一=0,周日=6
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    try {
      const stored = wx.getStorageSync('courseSchedule');
      if (!stored || !stored[currentDay]) {
        // 没有课程，清除提醒
        if (this.remindedCourseId) {
          this.remindedCourseId = null;
          this.currentCourse = null;
          this.callbacks.onDismiss && this.callbacks.onDismiss();
        }
        return;
      }

      const todayCourses = stored[currentDay];

      for (let slot = 0; slot < todayCourses.length; slot++) {
        const course = todayCourses[slot];
        if (!course || !course.startTime) continue;

        // 解析课程开始时间
        const [startH, startM] = course.startTime.split(':').map(Number);
        const startMinutes = startH * 60 + startM;

        // 计算距离当前时间的分钟数
        const diffMinutes = startMinutes - currentMinutes;

        // 在20分钟窗口内 且 未提醒过 且 课程有位置信息
        if (diffMinutes > 0 && diffMinutes <= REMINDER_MINUTES && course.latitude && course.longitude) {
          if (this.remindedCourseId === course.id) {
            return; // 已提醒过，跳过
          }

          this.remindedCourseId = course.id;
          this.currentCourse = course;
          this.getCurrentLocationAndCalcDistance(course, diffMinutes);
          return;
        }
      }

      // 没有找到即将开始的课程，清除提醒
      if (this.remindedCourseId) {
        this.remindedCourseId = null;
        this.currentCourse = null;
        this.callbacks.onDismiss && this.callbacks.onDismiss();
      }
    } catch (e) {
      console.error('检查课程失败:', e);
    }
  }

  // 获取当前位置并计算距离
  getCurrentLocationAndCalcDistance(course, diffMinutes) {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        const distance = calculateDistance(
          res.latitude, res.longitude,
          course.latitude, course.longitude
        );

        this.callbacks.onReminder && this.callbacks.onReminder({
          ...course,
          distance: Math.round(distance),
          diffMinutes: diffMinutes
        });
      },
      fail: () => {
        // 获取位置失败，仍显示提醒（距离显示为--）
        this.callbacks.onReminder && this.callbacks.onReminder({
          ...course,
          distance: null,
          diffMinutes: diffMinutes
        });
      }
    });
  }

  // 用户点击导航后，清除当前提醒
  clearReminder() {
    this.remindedCourseId = null;
    this.currentCourse = null;
  }
}

module.exports = CourseReminderService;