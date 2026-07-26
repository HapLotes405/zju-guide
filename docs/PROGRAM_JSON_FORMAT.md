# 培养方案 JSON 格式规范

> 给郑轶 — 按这个格式出 JSON，我直接导入数据库

## 格式

```json
[
  {
    "majorName": "材料科学与工程",
    "year": 2025,
    "totalCredits": 170,
    "requirementGroups": [
      { "name": "自然科学通识", "requiredCredits": 26.5, "category": "gen_ed" },
      { "name": "外语类", "requiredCredits": 6, "category": "gen_ed" },
      { "name": "思政类", "requiredCredits": 17, "category": "gen_ed" },
      { "name": "学科基础课程", "requiredCredits": 11, "category": "major_base" },
      { "name": "专业核心课程", "requiredCredits": 22, "category": "major_core" },
      { "name": "专业模块选修", "requiredCredits": 8, "category": "major_module" },
      { "name": "实验实践课程", "requiredCredits": 6, "category": "major_core" },
      { "name": "个性修读", "requiredCredits": 15, "category": "personalized" }
    ],
    "courses": [
      {
        "code": "MATH1135G",
        "name": "微积分（甲）I",
        "credits": 5.0,
        "suggestedSemester": 1,
        "isCompulsory": true,
        "groupIndex": 0
      },
      {
        "code": "CS100RG",
        "name": "C程序设计基础",
        "credits": 3.0,
        "suggestedSemester": 1,
        "isCompulsory": true,
        "groupIndex": 0
      }
    ]
  }
]
```

## 字段说明

| 字段 | 类型 | 必须 | 说明 |
|------|------|------|------|
| `majorName` | string | ✅ | 专业全称，如"计算机科学与技术" |
| `year` | number | ✅ | 年级，如 2025（代表2025级） |
| `totalCredits` | number | ✅ | 毕业总学分 |
| `requirementGroups` | array | ✅ | 课程模块分组 |
| `requirementGroups[].name` | string | ✅ | 分组名，如"自然科学通识" |
| `requirementGroups[].requiredCredits` | number | ✅ | 该分组要求最低学分 |
| `requirementGroups[].category` | string | ✅ | 只能是以下之一：`gen_ed`(通识) / `major_base`(专业基础) / `major_core`(专业核心) / `major_module`(专业模块) / `personalized`(个性修读) |
| `courses` | array | ✅ | 课程列表 |
| `courses[].code` | string | ✅ | 课号，如 MATH1135G。**必须用浙大教务系统的标准课号** |
| `courses[].name` | string | ✅ | 课程全称 |
| `courses[].credits` | number | ✅ | 学分数 |
| `courses[].suggestedSemester` | number | ✅ | 建议修读学期（1-8对应大一上到大四下，9-10为暑期） |
| `courses[].isCompulsory` | boolean | ✅ | 是否必修（true=必修, false=选修） |
| `courses[].groupIndex` | number | ❌ | 属于哪个 requirementGroup（用数组下标 0/1/2...），不填则为null |

## 提交方式

所有专业放进一个 JSON 数组里 `[{...}, {...}, ...]`，发我一个文件即可。导入时自动处理重复（已存在的专业会更新而不是报错）。

## 566 份培养方案的字段来源

从培养方案 PDF 提取时，需要的信息：
- 专业名称 → `majorName`
- 年级 → `year`
- 毕业总学分 → `totalCredits`
- 课程模块 → `requirementGroups`（通识/专业基础/专业核心/选修/实践等）
- 每门课 → `courses`（课号、名称、学分、建议学期、是否必修）

建议以学院为单位分批出 JSON，方便校验。
