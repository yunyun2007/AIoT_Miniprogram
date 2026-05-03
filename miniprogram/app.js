App({
  onLaunch() {
    // 检查更新
    const updateManager = wx.getUpdateManager();
    updateManager.onCheckForUpdate((res) => {
      if (res.hasUpdate) {
        updateManager.onUpdateReady(() => {
          wx.showModal({
            title: '更新提示',
            content: '新版本已准备好，是否重启应用？',
            success: (res) => {
              if (res.confirm) updateManager.applyUpdate();
            }
          });
        });
      }
    });

    // 初始化本地存储
    if (!wx.getStorageSync('courseSchedule')) {
      wx.setStorageSync('courseSchedule', [[], [], [], [], [], [], []]);
    }
  },

  globalData: {
    userInfo: null,
    deviceId: '',
    huaweiConfig: null
  }
});