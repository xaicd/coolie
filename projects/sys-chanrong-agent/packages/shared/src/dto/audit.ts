/**
 * 不可篡改哈希链审计记录 DTO（REQ-BASE-008）。
 * 状态变更时与业务变更同事务写入；写审计失败即整体回滚。
 */
export interface AuditChainRecordDto {
  id: string;
  companyId: string;
  entityType: string;
  entityId: string;
  action: string;
  beforeVal: Record<string, unknown> | null;
  afterVal: Record<string, unknown> | null;
  actorId: string;
  sourceIp: string | null;
  prevHash: string;
  rowHash: string;
  createdAt: string;
}

/** 审计链查询响应载荷。 */
export interface AuditChainQueryResult {
  entityType: string;
  entityId: string;
  records: AuditChainRecordDto[];
}
