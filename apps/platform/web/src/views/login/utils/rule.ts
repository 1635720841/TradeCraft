import { reactive } from "vue";
import type { FormRules } from "element-plus";

/** 登录校验（仅校验非空；复杂度在创建/重置密码时校验） */
const loginRules = reactive<FormRules>({
  username: [
    {
      required: true,
      message: "请输入邮箱 / 账号",
      trigger: "blur"
    }
  ],
  password: [
    {
      required: true,
      message: "请输入密码",
      trigger: "blur"
    },
    {
      min: 6,
      message: "密码至少 6 位",
      trigger: "blur"
    }
  ]
});

/** 注册/改密用：8-18 位且含至少两种字符类型 */
export const REGEXP_PWD =
  /^(?![0-9]+$)(?![a-z]+$)(?![A-Z]+$)(?!([^(0-9a-zA-Z)]|[()])+$)(?!^.*[\u4E00-\u9FA5].*$)([^(0-9a-zA-Z)]|[()]|[a-z]|[A-Z]|[0-9]){8,18}$/;

export { loginRules };
