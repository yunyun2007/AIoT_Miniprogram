Page({
  data: {
    todayDate: '',
    todayData: {
      distance: 0,
      duration: 0,
      calories: 0,
      avgSpeed: 0
    },
    currentMonth: '',
    monthData: {
      totalDistance: 0,
      totalDuration: 0,
      totalCalories: 0,
      rideCount: 0
    },
    weekData: [],
    historyList: [],
    pbData: {
      maxDistance: 0,
      maxDistanceDate: '',
      maxDuration: 0,
      maxDurationDate: '',
      maxCalories: 0,
      maxCaloriesDate: ''
    }
  },

  onShow() {
    this.loadAllData();
  },

  loadAllData() {
    const now = new Date();
    this.setData({
      todayDate: `${now.getMonth() + 1}月${now.getDate()}日`,
      currentMonth: `${now.getFullYear()}年${now.getMonth() + 1}月`
    });

    this.loadTodayData();
    this.loadWeekData();
    this.loadMonthData();
    this.loadHistory();
    this.loadPersonalBest();
  },

  // 今日数据
  loadTodayData() {
    const today = new Date().toDateString();
    const records = wx.getStorageSync('rideRecords') || [];
    const todayRecord = records.find(r => r.date === today);
    
    if (todayRecord) {
      const avgSpeed = todayRecord.duration > 0 
        ? (todayRecord.distance / (todayRecord.duration / 60)).toFixed(1)
        : 0;
      
      this.setData({
        todayData: {
          distance: todayRecord.distance || 0,
          duration: todayRecord.duration || 0,
          calories: todayRecord.calories || 0,
          avgSpeed: avgSpeed
        }
      });
    }
  },

  // 本周数据（模拟最近7天）
  loadWeekData() {
    const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const records = wx.getStorageSync('rideRecords') || [];
    const weekData = [];
    
    // 获取今天是周几（0=周日, 1=周一...）
    const today = new Date();
    const todayDay = today.getDay(); // 0-6
    // 转换为周一=0, 周日=6
    const todayIndex = todayDay === 0 ? 6 : todayDay - 1;
    
    // 从本周一开始，到本周日
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      // 计算本周一的日期，然后加 i 天
      d.setDate(today.getDate() - todayIndex + i);
      const dateStr = d.toDateString();
      const record = records.find(r => r.date === dateStr);
      
      weekData.push({
        day: days[i],  // 直接按顺序取周一到周日
        distance: record ? record.distance : 0,
        duration: record ? record.duration : 0
      });
    }
    
    this.setData({ weekData });
},

  // 本月数据
  loadMonthData() {
    const now = new Date();
    const records = wx.getStorageSync('rideRecords') || [];
    
    const monthRecords = records.filter(r => {
      const d = new Date(r.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    const totalDistance = monthRecords.reduce((sum, r) => sum + (r.distance || 0), 0);
    const totalDuration = monthRecords.reduce((sum, r) => sum + (r.duration || 0), 0);
    const totalCalories = monthRecords.reduce((sum, r) => sum + (r.calories || 0), 0);

    this.setData({
      monthData: {
        totalDistance: totalDistance.toFixed(1),
        totalDuration: (totalDuration / 60).toFixed(1),
        totalCalories: totalCalories,
        rideCount: monthRecords.length
      }
    });
  },

  // 历史记录（最近5条）
  loadHistory() {
    const records = wx.getStorageSync('rideRecords') || [];
    const sorted = records.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    const historyList = sorted.slice(0, 5).map(r => {
      const d = new Date(r.date);
      return {
        day: d.getDate(),
        month: d.getMonth() + 1,
        title: r.title || '日常骑行',
        startTime: r.startTime || '08:00',
        endTime: r.endTime || '09:00',
        distance: r.distance || 0,
        duration: r.duration || 0
      };
    });

    this.setData({ historyList });
  },

  // 个人最佳
  loadPersonalBest() {
    const records = wx.getStorageSync('rideRecords') || [];
    if (records.length === 0) return;

    let maxDist = 0, maxDistDate = '';
    let maxDur = 0, maxDurDate = '';
    let maxCal = 0, maxCalDate = '';

    records.forEach(r => {
      if ((r.distance || 0) > maxDist) {
        maxDist = r.distance;
        maxDistDate = new Date(r.date).toLocaleDateString();
      }
      if ((r.duration || 0) > maxDur) {
        maxDur = r.duration;
        maxDurDate = new Date(r.date).toLocaleDateString();
      }
      if ((r.calories || 0) > maxCal) {
        maxCal = r.calories;
        maxCalDate = new Date(r.date).toLocaleDateString();
      }
    });

    this.setData({
      pbData: {
        maxDistance: maxDist.toFixed(1),
        maxDistanceDate: maxDistDate,
        maxDuration: maxDur,
        maxDurationDate: maxDurDate,
        maxCalories: maxCal,
        maxCaloriesDate: maxCalDate
      }
    });
  },

  // 查看全部历史
  viewAllHistory() {
    wx.navigateTo({ url: '/pages/history/history' });
  },

  // 查看单次详情
  viewRideDetail(e) {
    const index = e.currentTarget.dataset.index;
    wx.navigateTo({
      url: `/pages/rideDetail/rideDetail?index=${index}`
    });
  }
});