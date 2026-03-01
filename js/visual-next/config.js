module.exports = {
  // 根据 Protocol.md 定义的状态映射
  statusMappings: {
    // 比赛阶段
    current_stage: [
      { value: 0, label: "未开始" },
      { value: 1, label: "准备阶段" },
      { value: 2, label: "自检阶段" },
      { value: 3, label: "倒计时" },
      { value: 4, label: "比赛中" },
      { value: 5, label: "结算中" },
    ],
    // 基地状态
    base_status: [
      { value: 0, label: "无敌" },
      { value: 1, label: "解除无敌护甲未展开" },
      { value: 2, label: "解除无敌护甲展开" },
    ],
    // 前哨站状态
    outpost_status: [
      { value: 0, label: "无敌" },
      { value: 1, label: "存活转" },
      { value: 2, label: "存活停" },
      { value: 3, label: "毁不可建" },
      { value: 4, label: "毁可建" },
    ],
    // 连接状态
    connection_state: [
      { value: 0, label: "未连接" },
      { value: 1, label: "连接" },
    ],
    // 上场状态
    field_state: [
      { value: 0, label: "已上场" },
      { value: 1, label: "未上场" },
    ],
    // 存活状态
    alive_state: [
      { value: 0, label: "未知" },
      { value: 1, label: "存活" },
      { value: 2, label: "战亡" },
    ],
    // 模块状态 (通用)
    power_manager: [
      { value: 0, label: "离线" },
      { value: 1, label: "在线" },
    ],
    rfid: [
      { value: 0, label: "离线" },
      { value: 1, label: "在线" },
    ],
    light_strip: [
      { value: 0, label: "离线" },
      { value: 1, label: "在线" },
    ],
    small_shooter: [
      { value: 0, label: "离线" },
      { value: 1, label: "在线" },
    ],
    big_shooter: [
      { value: 0, label: "离线" },
      { value: 1, label: "在线" },
    ],
    uwb: [
      { value: 0, label: "离线" },
      { value: 1, label: "在线" },
    ],
    armor: [
      { value: 0, label: "离线" },
      { value: 1, label: "在线" },
    ],
    video_transmission: [
      { value: 0, label: "离线" },
      { value: 1, label: "在线" },
    ],
    capacitor: [
      { value: 0, label: "离线" },
      { value: 1, label: "在线" },
    ],
    main_controller: [
      { value: 0, label: "离线" },
      { value: 1, label: "在线" },
    ],
    // 处罚类型
    penalty_type: [
      { value: 1, label: "黄牌" },
      { value: 2, label: "双方黄牌" },
      { value: 3, label: "红牌" },
      { value: 4, label: "超功率" },
      { value: 5, label: "超热量" },
      { value: 6, label: "超射速" },
    ],
    // 飞镖目标
    target_id: [
      { value: 1, label: "前哨站" },
      { value: 2, label: "基地固定目标" },
      { value: 3, label: "基地随机固定目标" },
      { value: 4, label: "基地随机移动目标" },
      { value: 5, label: "基地末端移动目标" },
    ],
    // 空中支援指令
    command_id: [
      { value: 1, label: "免费呼叫" },
      { value: 2, label: "花费金币呼叫" },
      { value: 3, label: "中断" },
    ],
    // Buff类型
    buff_type: [
      { value: 1, label: "攻击增益" },
      { value: 2, label: "防御增益" },
      { value: 3, label: "冷却增益" },
      { value: 4, label: "功率增益" },
      { value: 5, label: "回血增益" },
      { value: 6, label: "发弹增益" },
      { value: 7, label: "地形跨越增益" },
    ],
    // 能量机关状态
    rune_status: [
      { value: 1, label: "未激活" },
      { value: 2, label: "正在激活" },
      { value: 3, label: "已激活" },
    ],
    // 科技核心状态
    core_status: [
      { value: 1, label: "未进入装配状态" },
      { value: 2, label: "进入装配状态" },
      { value: 3, label: "已选择装配难度" },
      { value: 4, label: "装配中" },
      { value: 5, label: "装配完成" },
      { value: 6, label: "已确认装配,科技核心移动中" },
    ],
    // 部署模式状态 (DeployModeStatusSync的status字段)
    deploy_mode_status: [
      { value: 0, label: "未部署" },
      { value: 1, label: "已部署" },
    ],
    // 部署模式
    deploy_status: [
      { value: 0, label: "未部署" },
      { value: 1, label: "已部署" },
    ],
    // 空中支援状态
    airsupport_status: [
      { value: 0, label: "未进行空中支援" },
      { value: 1, label: "正在空中支援" },
      { value: 2, label: "空中支援被锁定" },
    ],
    // 哨兵姿态
    posture_id: [
      { value: 1, label: "进攻姿态" },
      { value: 2, label: "防御姿态" },
      { value: 3, label: "移动姿态" },
    ],
    intention: [
      { value: 1, label: "攻击" },
      { value: 2, label: "防守" },
      { value: 3, label: "移动" },
    ],
    // 装配操作
    operation: [
      { value: 1, label: "确认装配" },
      { value: 2, label: "取消装配" },
    ],
    // 性能体系
    shooter: [
      { value: 1, label: "冷却优先" },
      { value: 2, label: "爆发优先" },
      { value: 3, label: "英雄近战优先" },
      { value: 4, label: "英雄远程优先" },
    ],
    chassis: [
      { value: 1, label: "血量优先" },
      { value: 2, label: "功率优先" },
      { value: 3, label: "英雄近战优先" },
      { value: 4, label: "英雄远程优先" },
    ],
    performance_system_shooter: [
      { value: 1, label: "冷却优先" },
      { value: 2, label: "爆发优先" },
      { value: 3, label: "英雄近战优先" },
      { value: 4, label: "英雄远程优先" },
    ],
    performance_system_chassis: [
      { value: 1, label: "血量优先" },
      { value: 2, label: "功率优先" },
      { value: 3, label: "英雄近战优先" },
      { value: 4, label: "英雄远程优先" },
    ],
    // 地图点击发送范围
    is_send_all: [
      { value: 0, label: "指定客户端" },
      { value: 1, label: "除哨兵" },
      { value: 2, label: "包含哨兵" },
    ],
    // 标记模式
    mode: [
      { value: 1, label: "地图" },
      { value: 2, label: "对方机器人" },
    ],
    // 标记类型
    type: [
      { value: 1, label: "攻击" },
      { value: 2, label: "防御" },
      { value: 3, label: "警戒" },
      { value: 4, label: "自定义" },
    ],
    // 英雄部署模式指令
    hero_deploy_mode: [
      { value: 0, label: "退出" },
      { value: 1, label: "进入" },
    ],
    // 能量机关激活
    activate: [
      { value: 0, label: "否" },
      { value: 1, label: "开启" },
    ],
    // 结果码
    result_code: [
      { value: 0, label: "成功" },
      { value: 1, label: "失败" },
    ],
    // 机制ID
    mechanism_id: [
      { value: 1, label: "己方堡垒被占领" },
      { value: 2, label: "对方堡垒被占领" },
    ],
    // 是否高亮
    is_high_light: [
      { value: 0, label: "否" },
      { value: 1, label: "是" },
    ],
  },

  // 消息名称友好显示映射
  messageDisplayNames: {
    GlobalUnitStatus: "全局单位状态",
    GameStatus: "比赛状态",
    GlobalLogisticsStatus: "全局后勤状态",
    GlobalSpecialMechanism: "全局特殊机制",
    Event: "事件通知",
    RobotInjuryStat: "机器人受伤统计",
    RobotRespawnStatus: "机器人复活状态",
    RobotStaticStatus: "机器人静态状态",
    RobotDynamicStatus: "机器人动态状态",
    RobotModuleStatus: "机器人模块状态",
    RobotPosition: "机器人位置",
    Buff: "Buff 信息",
    PenaltyInfo: "判罚信息",
    RobotPathPlanInfo: "哨兵轨迹规划",
    RaderInfoToClient: "雷达位置信息",
    CustomByteBlock: "自定义数据块",
    TechCoreMotionStateSync: "科技核心运动状态",
    RobotPerformanceSelectionSync: "性能体系状态",
    DeployModeStatus: "部署模式状态",
    RuneStatusSync: "能量机关状态",
    SentinelStatusSync: "哨兵状态",
    DartSelectTargetStatusSync: "飞镖目标选择状态",
    GuardCtrlResult: "哨兵控制结果",
    AirSupportStatusSync: "空中支援状态",
  },

  // 每条消息默认频率 (Hz) - 依据 Protocol.md
  messageDefaultFrequencies: {
    GameStatus: 5, // 5Hz
    GlobalUnitStatus: 1, // 1Hz
    GlobalLogisticsStatus: 1, // 1Hz
    GlobalSpecialMechanism: 1, // 1Hz
    RobotInjuryStat: 1, // 1Hz
    RobotRespawnStatus: 1, // 1Hz
    RobotStaticStatus: 1, // 1Hz
    RobotDynamicStatus: 10, // 10Hz
    RobotModuleStatus: 1, // 1Hz
    RobotPosition: 1, // 1Hz
    Buff: 1, // 1Hz
    PenaltyInfo: 1, // trigger
    RobotPathPlanInfo: 1, // 1Hz
    RaderInfoToClient: 1, // 1Hz
    CustomByteBlock: 50, // 50Hz
    TechCoreMotionStateSync: 1, // 1Hz
    RobotPerformanceSelectionSync: 1, // 1Hz
    DeployModeStatusSync: 1, // 1Hz
    RuneStatusSync: 1, // 1Hz
    SentinelStatusSync: 1, // 1Hz
    DartSelectTargetStatusSync: 1, // 1Hz
    GuardCtrlResult: 1, // 1Hz
    AirSupportStatusSync: 1, // 1Hz
  },
};
