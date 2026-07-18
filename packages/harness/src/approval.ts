import type { Action } from "./action.js";
import type { PolicyDecision } from "./policy.js";

export interface ApprovalRequest {
  action: Action;
}

export type ApprovalHandler = (request: ApprovalRequest) => boolean | Promise<boolean>;

export type ApprovalErrorCode =
  | "POLICY_DENIED"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_DENIED"
  | "APPROVAL_FAILED";

export type ApprovalResult<Value> =
  | { ok: true; value: Value }
  | { ok: false; error: { code: ApprovalErrorCode; message: string } };

function failure(code: ApprovalErrorCode, message: string): ApprovalResult<never> {
  return { ok: false, error: { code, message } };
}

export class ApprovalGate {
  readonly #approve: ApprovalHandler | undefined;

  constructor(approve?: ApprovalHandler) {
    this.#approve = approve;
  }

  async execute<Value>(
    decision: PolicyDecision,
    request: ApprovalRequest,
    handler: () => Value | Promise<Value>
  ): Promise<ApprovalResult<Value>> {
    if (decision === "deny") {
      return failure("POLICY_DENIED", "策略拒绝执行该动作");
    }

    if (decision === "allow") {
      return { ok: true, value: await handler() };
    }

    if (this.#approve === undefined) {
      return failure("APPROVAL_REQUIRED", "该动作需要明确批准");
    }

    let approved: boolean;
    try {
      approved = await this.#approve(request);
    } catch {
      return failure("APPROVAL_FAILED", "批准确认过程失败");
    }

    if (!approved) {
      return failure("APPROVAL_DENIED", "用户未批准该动作");
    }

    return { ok: true, value: await handler() };
  }
}
