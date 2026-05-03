import Toast from '@vant/weapp/toast/toast';
import Dialog from '@vant/weapp/dialog/dialog';

Page({
  data: {
    weekDays: [
      { name: '周一', date: '' },
      { name: '周二', date: '' },
      { name: '周三', date: '' },
      { name: '周四', date: '' },
      { name: '周五', date: '' },
      { name: '周六', date: '' },
      { name: '周日', date: '' }
    ],
    currentDay: new Date().getDay() === 0 ? 6 : new Date().getDay() - 1,
    
    timeSlots: [
      { start: '08:00', end: '08:45' },
      { start: '08:50', end: '09:35' },
      { start: '10:00', end: '10:45' },
      { start: '10:50', end: '11:35' },
      { start: '11:40', end: '12:25' },
      { start: '13:25', end: '14:10' },
      { start: '14:15', end: '15:00' },
      { start: '15:05', end: '15:50' },
      { start: '16:15', end: '17:00' },
      { start: '17:05', end: '17:50' },
      { start: '18:50', end: '19:35' },
      { start: '19:40', end: '20:25' },
      { start: '20:30', end: '21:15' }
    ],
    cellHeight: 140,
    
    courseList: [[], [], [], [], [], [], []],
    
    showEditPopup: false,
    isEdit: false,
    editDay: 0,
    editSlot: 0,
    
    currentCourse: {
      name: '',
      locationName: '',
      latitude: null,
      longitude: null,
      color: 'blue',
      remark: ''
    },
    
    colorOptions: ['blue', 'green', 'orange', 'red', 'purple', 'teal'],
    isSyncing: false
  },

  onLoad() {
    this.initWeekDates();
    this.loadScheduleFromStorage();
  },

  onShow() {
    this.loadScheduleFromStorage();
  },

  initWeekDates() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    
    const weekDays = this.data.weekDays.map((day, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return {
        ...day,
        date: `${date.getMonth() + 1}/${date.getDate()}`
      };
    });
    
    this.setData({ weekDays });
  },

  loadScheduleFromStorage() {
    try {
      const stored = wx.getStorageSync('courseSchedule');
      if (stored) {
        const courseList = [[], [], [], [], [], [], []];
        stored.forEach((day, dayIndex) => {
          if (day && Array.isArray(day)) {
            day.forEach((course, slotIndex) => {
              if (course && slotIndex < this.data.timeSlots.length) {
                courseList[dayIndex][slotIndex] = course;
              }
            });
          }
        });
        this.setData({ courseList });
      }
    } catch (e) {
      console.error('加载课表失败', e);
    }
  },

  saveScheduleToStorage() {
    try {
      wx.setStorageSync('courseSchedule', this.data.courseList);
    } catch (e) {
      console.error('保存课表失败', e);
      Toast.fail('保存失败');
    }
  },

  onCellTap(e) {
    const { day, slot } = e.currentTarget.dataset;
    const existingCourse = this.data.courseList[day][slot];
    
    this.setData({
      editDay: day,
      editSlot: slot,
      isEdit: !!existingCourse,
      currentCourse: existingCourse ? { ...existingCourse } : {
        name: '',
        locationName: '',
        latitude: null,
        longitude: null,
        color: 'blue',
        remark: ''
      },
      showEditPopup: true
    });
  },

  onClosePopup() {
    this.setData({ showEditPopup: false });
  },

  onNameChange(e) {
    this.setData({ 'currentCourse.name': e.detail });
  },

  onRemarkChange(e) {
    this.setData({ 'currentCourse.remark': e.detail });
  },

  selectColor(e) {
    this.setData({ 'currentCourse.color': e.currentTarget.dataset.color });
  },

  // ==================== 核心：地图选点 ====================
  async chooseLocation() {
    try {
      const setting = await wx.getSetting();
      if (!setting.authSetting['scope.userLocation']) {
        await wx.authorize({ scope: 'scope.userLocation' });
      }

      const location = await wx.chooseLocation({
        latitude: this.data.currentCourse.latitude || undefined,
        longitude: this.data.currentCourse.longitude || undefined
      });

      this.setData({
        'currentCourse.locationName': location.name || location.address,
        'currentCourse.latitude': location.latitude,
        'currentCourse.longitude': location.longitude,
        'currentCourse.address': location.address
      });

      Toast.success('位置已绑定');
    } catch (err) {
      console.error('选择位置失败:', err);
      if (err.errMsg && err.errMsg.includes('fail auth')) {
        Toast.fail('请授权位置权限');
        wx.openSetting();
      } else if (err.errMsg && !err.errMsg.includes('cancel')) {
        Toast.fail('选择位置失败');
      }
    }
  },

  // ==================== 保存/删除课程 ====================
  saveCourse() {
    const { currentCourse, editDay, editSlot } = this.data;
    
    if (!currentCourse.name.trim()) {
      Toast.fail('请输入课程名称');
      return;
    }
    if (!currentCourse.latitude || !currentCourse.longitude) {
      Toast.fail('请选择上课地点');
      return;
    }

    const course = {
      id: currentCourse.id || Date.now().toString(),
      name: currentCourse.name.trim(),
      day: editDay,
      slot: editSlot,
      startTime: this.data.timeSlots[editSlot].start,
      endTime: this.data.timeSlots[editSlot].end,
      locationName: currentCourse.locationName,
      latitude: currentCourse.latitude,
      longitude: currentCourse.longitude,
      address: currentCourse.address || '',
      color: currentCourse.color,
      remark: currentCourse.remark || '',
      createdAt: currentCourse.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const courseList = this.data.courseList;
    if (!courseList[editDay]) courseList[editDay] = [];
    courseList[editDay][editSlot] = course;

    this.setData({ courseList }, () => {
      this.saveScheduleToStorage();
      this.setData({ showEditPopup: false });
      Toast.success('保存成功');
    });
  },

  deleteCourse() {
    Dialog.confirm({
      title: '确认删除',
      message: '确定要删除这门课程吗？'
    }).then(() => {
      const { editDay, editSlot } = this.data;
      const courseList = this.data.courseList;
      courseList[editDay][editSlot] = null;
      
      this.setData({ courseList }, () => {
        this.saveScheduleToStorage();
        this.setData({ showEditPopup: false });
        Toast.success('已删除');
      });
    }).catch(() => {});
  },

  // ==================== 一键同步到设备 ====================
  async syncToDevice() {
    const { courseList } = this.data;
    
    const validCourses = [];
    courseList.forEach((day, dayIndex) => {
      if (day && Array.isArray(day)) {
        day.forEach((course, slotIndex) => {
          if (course && course.name) {
            validCourses.push({ ...course, day: dayIndex, slot: slotIndex });
          }
        });
      }
    });

    if (validCourses.length === 0) {
      Toast.fail('请先添加课程');
      return;
    }

    this.setData({ isSyncing: true });

    try {
      const syncData = {
        type: 'SCHEDULE_SYNC',
        version: Date.now(),
        deviceId: wx.getStorageSync('deviceId') || '',
        courses: validCourses.map(course => ({
          id: course.id,
          name: course.name,
          day: course.day,
          slot: course.slot,
          startTime: course.startTime,
          endTime: course.endTime,
          latitude: course.latitude,
          longitude: course.longitude,
          locationName: course.locationName,
          color: course.color,
          remark: course.remark
        })),
        syncTime: new Date().toISOString()
      };

      // 实际生产环境调用云函数
      try {
        const { result } = await wx.cloud.callFunction({
          name: 'syncScheduleToDevice',
          data: {
            deviceId: syncData.deviceId,
            command: {
              commandName: 'UPDATE_SCHEDULE',
              paras: syncData,
              serviceId: 'schedule'
            }
          }
        });
        
        if (result.code === 0) {
          Toast.success('同步成功');
          wx.setStorageSync('lastSyncTime', new Date().toISOString());
        } else {
          throw new Error(result.message);
        }
      } catch (cloudErr) {
        console.warn('云函数调用失败，模拟同步:', cloudErr);
        // 模拟成功（开发阶段）
        setTimeout(() => {
          Toast.success('模拟同步成功');
          wx.setStorageSync('lastSyncTime', new Date().toISOString());
        }, 1500);
      }
    } catch (err) {
      Toast.fail(err.message || '同步失败');
    } finally {
      this.setData({ isSyncing: false });
    }
  }
});