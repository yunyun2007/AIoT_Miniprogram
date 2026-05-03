/**
 * 碰撞检测服务
 * 基于IMU加速度数据进行碰撞检测
 * 触发SOS紧急求助
 */

class CrashDetector {
  constructor() {
    // 灵敏度阈值 (m/s²)
    // 低: 35, 中: 25, 高: 15
    this.thresholds = [35, 25, 15];

    // 当前灵敏度 (0=低, 1=中, 2=高)
    this.sensitivity = 2;

    // 加速度历史记录（用于判断持续时间）
    this.accelerationHistory = [];
    this.historyMaxLength = 10;

    // 触发状态
    this.isTriggered = false;
    this.triggerStartTime = null;

    // 触发持续要求 (100ms)
    this.triggerDuration = 100;

    // SOS回调
    this.onSOS = null;

    // SOS冷却时间（防止重复触发）
    this.cooldownPeriod = 30000; // 30秒
    this.lastTriggerTime = 0;
  }

  /**
   * 设置灵敏度
   * @param {number} level - 0=低, 1=中, 2=高
   */
  setSensitivity(level) {
    if (level >= 0 && level <= 2) {
      this.sensitivity = level;
    }
  }

  /**
   * 从本地设置加载灵敏度
   */
  loadSensitivity() {
    const settings = wx.getStorageSync('settings') || {};
    if (settings.sensitivity !== undefined) {
      this.sensitivity = settings.sensitivity;
    }
  }

  /**
   * 计算加速度幅值
   * @param {number} ax - X轴加速度
   * @param {number} ay - Y轴加速度
   * @param {number} az - Z轴加速度
   * @returns {number} 加速度幅值 (m/s²)
   */
  calculateMagnitude(ax, ay, az) {
    return Math.sqrt(ax * ax + ay * ay + az * az);
  }

  /**
   * 处理加速度数据
   * @param {Object} data - { accelerationX, accelerationY, accelerationZ }
   * @returns {Object} - { magnitude, isHigh, isTriggered }
   */
  processAcceleration(data) {
    const { accelerationX, accelerationY, accelerationZ } = data;

    // 计算幅值
    const magnitude = this.calculateMagnitude(
      accelerationX || 0,
      accelerationY || 0,
      accelerationZ || 0
    );

    // 获取当前阈值
    const threshold = this.thresholds[this.sensitivity];

    // 判断是否超过阈值
    const isHigh = magnitude > threshold;

    // 添加到历史记录
    this.accelerationHistory.push({
      magnitude,
      isHigh,
      timestamp: Date.now()
    });

    // 保持历史记录长度
    if (this.accelerationHistory.length > this.historyMaxLength) {
      this.accelerationHistory.shift();
    }

    // 检查触发条件
    const result = this.checkTrigger();

    return {
      magnitude,
      threshold,
      isHigh,
      isTriggered: result.isTriggered
    };
  }

  /**
   * 检查是否触发SOS
   * @returns {Object} - { isTriggered, duration }
   */
  checkTrigger() {
    if (this.isTriggered) {
      return { isTriggered: true, duration: Date.now() - this.triggerStartTime };
    }

    // 检查冷却时间
    const now = Date.now();
    if (now - this.lastTriggerTime < this.cooldownPeriod) {
      return { isTriggered: false, duration: 0 };
    }

    // 检查是否有足够的高加速度持续时间
    const recentHighPoints = this.accelerationHistory.filter(p => p.isHigh);

    if (recentHighPoints.length < 3) {
      return { isTriggered: false, duration: 0 };
    }

    // 计算持续时间
    const firstHighTime = recentHighPoints[0].timestamp;
    const duration = now - firstHighTime;

    if (duration >= this.triggerDuration) {
      this.isTriggered = true;
      this.triggerStartTime = firstHighTime;
      this.lastTriggerTime = now;

      // 触发SOS
      this._triggerSOS();

      return { isTriggered: true, duration };
    }

    return { isTriggered: false, duration };
  }

  /**
   * 触发SOS
   */
  _triggerSOS() {
    console.log('[CrashDetector] SOS triggered!');

    // 获取紧急联系人
    const contacts = wx.getStorageSync('emergencyContacts') || [];
    const defaultContact = contacts.find(c => c.isDefault);

    // 获取当前GPS位置
    const deviceInfo = wx.getStorageSync('deviceInfo') || {};
    const currentRide = wx.getStorageSync('currentRide') || {};

    const sosData = {
      timestamp: Date.now(),
      contact: defaultContact ? `${defaultContact.name} ${defaultContact.phone}` : '未设置联系人',
      location: currentRide.latitude ? `${currentRide.latitude},${currentRide.longitude}` : '位置未知',
      deviceId: deviceInfo.deviceId || '未知设备'
    };

    console.log('[CrashDetector] SOS Data:', sosData);

    if (this.onSOS) {
      this.onSOS(sosData);
    }

    // 显示提示
    wx.showModal({
      title: '检测到异常震动',
      content: `紧急联系人: ${sosData.contact}\n位置: ${sosData.location}`,
      showCancel: false,
      confirmText: '我知道了'
    });

    // 重置触发状态（30秒后可再次触发）
    setTimeout(() => {
      this.isTriggered = false;
    }, this.cooldownPeriod);
  }

  /**
   * 设置SOS回调
   */
  setOnSOS(callback) {
    this.onSOS = callback;
  }

  /**
   * 重置检测器状态
   */
  reset() {
    this.accelerationHistory = [];
    this.isTriggered = false;
    this.triggerStartTime = null;
  }

  /**
   * 获取当前状态信息
   */
  getStatus() {
    return {
      sensitivity: this.sensitivity,
      sensitivityText: ['低', '中', '高'][this.sensitivity],
      threshold: this.thresholds[this.sensitivity],
      isTriggered: this.isTriggered,
      historyLength: this.accelerationHistory.length
    };
  }
}

// 单例模式
let instance = null;

function getCrashDetector() {
  if (!instance) {
    instance = new CrashDetector();
    instance.loadSensitivity();
  }
  return instance;
}

module.exports = {
  CrashDetector,
  getCrashDetector
};
