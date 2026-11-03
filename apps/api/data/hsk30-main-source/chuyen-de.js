// ===== KHOA CHUYEN DE =====
// Cau truc: khoa -> phan (vd: Phan co ban) -> chu de -> bai.
// Moi bai: ten (tieu de), zh (tieu de tieng Trung, neu co), tu (chu Han cach nhau dau cach), on_tap (duong link on tap rieng, neu co).
// Bai chua co noi dung: de {} – app se hien "Dang cap nhat".
// Tu chua co trong bang tu thi them vao data/bo-sung.js (va gan nhan trong data/nhan.js).
window.HSK_COURSES = [
  {
    id: 'tm', ten: 'Tiếng Trung thương mại', zh: '商务汉语', icon: 'tm',
    mo_ta: 'Tiếng Trung dùng trong mua bán, giao dịch và làm việc với khách hàng.',
    phan: [
      {
        ten: 'Phần cơ bản',
        chu_de: [
          {
            ten: 'Con số và thời gian',
            bai: [
              {
                ten: 'Tổng cộng bao nhiêu tiền?',
                tu: '价格 便宜 贵 打折 现金 刷卡 扫码 支付 付款 大概 发票 需要 笔记本电脑 顾客 老板 总共 一共 批',
                on_tap: 'https://tangerine-malasada-023816.netlify.app/'
              },
              {
                ten: 'Mấy giờ họp?', zh: '几点开会？',
                tu: '会议 日程 安排 计划 开会 参加 准时 迟到 讨论 推迟 改 本来 相关 部门 通知 提醒'
              },
              {
                ten: 'Tôi sắp trễ rồi',
                tu: '还 出发 出门 路上 一定 迟到 堵车 着急 差点儿 忘 借 抱歉 压力 闹钟 经常 带 拖延 赶 赶紧 高峰期 幸好 抄小路 尽量 耽误 来得及 来不及 打车 消息',
                on_tap: 'https://bespoke-cranachan-045fdc.netlify.app/'
              }
            ]
          },
          {
            ten: 'Giới thiệu bản thân',
            bai: [
              {
                ten: 'Tôi xin tự giới thiệu bản thân 1 chút',
                tu: '应聘 面试 简历 能力 专业 毕业 自我介绍 职位 岗位 行业 平时 强 经验 优点 缺点 擅长 负责 熟悉 爱好 兴趣 沟通 团队合作 办公软件 加入 自己 数据 分析',
                on_tap: 'https://relaxed-tapioca-03014b.netlify.app/'
              },
              {
                ten: 'Tôi làm việc ở đây từ năm 2000',
                tu: '经历 具体 已经 主要 确保 进行 按 供应商 之间 协助 管理 文件 期间 升职 转岗 转正 高级 带 丰富 尝试 平台 发展 方向 国际 企业 成长 互相 离职'
              }
            ]
          },
          {
            ten: 'Thảo luận dự án',
            bai: [
              {
                ten: 'Chúng ta cần tìm ra phương án tốt hơn',
                tu: '方案 建议 提出 推广 活动 成本 效率 采用 其他 换 旧 优势 调整 延期 细节 适合 预算 电商平台 低 跟进 最 决定',
                on_tap: 'https://melodious-tartufo-fb5904.netlify.app/'
              },
              {
                ten: 'Chúng ta làm bằng cách nào?',
                tu: '方式 市场 调查 根据 进度 影响 网上 问卷 简单 节省 会计 准备 工具 换 操作 麻烦 了解 功能 速度 试用 决定 线上 线下 效果 担心 范围 测试 结果 推广',
                on_tap: 'https://sprightly-tapioca-7d05be.netlify.app/'
              }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'cx', ten: 'Tiếng Trung công xưởng', zh: '工厂汉语', icon: 'cx',
    mo_ta: 'Tiếng Trung dùng hằng ngày trong nhà máy: bộ phận, dây chuyền, kho và an toàn.',
    phan: [
      {
        ten: 'Phần cơ bản',
        chu_de: [
          {
            ten: 'Cơ cấu nhà máy và chức năng các bộ phận',
            bai: [
              {
                ten: 'Các bộ phận trong nhà máy',
                tu: '总经理 厂长 车间主任 组长 领班 员工 部门 采购部 生产部 品质部 仓库 物流部 工程部 项目部 人事部 合作 负责 汇报 上级 下级 沟通 管理',
                on_tap: 'https://resplendent-llama-7bb513.netlify.app/'
              },
              {},
              {}
            ]
          }
        ]
      }
    ]
  }
];
