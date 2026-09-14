// Published clue identities remain stable for Ink conditions and existing saves.
const factoryClueLabels: Readonly<Record<string, string>> = {
  return_with_luoli_referral_number: '转诊存根编号',
  return_with_luoli_false_notice: '虚假离厂通知',
  return_with_luoli_transfer_match: '转院记录对应说明',
  return_with_luoli_signature_account: '签字经过说明',
  return_with_luoli_home_words: '送医时的原话',
  return_with_luoli_full_recording: '完整原始录音',
  return_with_luoli_unauthorized_share: '未经同意转发录音的记录',
  return_with_luoli_two_dates: '两次事件的日期对应',
  return_with_luoli_complete_statement: '完整亲历说明',
  return_with_luoli_personal_invitation: '罗莉的会面邀请',
  return_with_luoli_personal_submission: '罗莉亲自递交更正申请',
  return_with_luoli_written_consent: '罗莉的书面更正确认',
  return_with_luoli_transport_account: '搬运经过补述',
  return_with_luoli_recall_handled_by_lawyer: '律师接手撤传联系的记录',
  return_with_luoli_share_trace_record: '录音转发去向记录',
  return_with_luoli_date_review_rescheduled: '日期核查改约记录',
};

export function clueLabel(worldId: string, clue: string): string {
  return worldId === 'workshop-0b3ce5e1-1f96-474d-871d-5e2a2a541713-r1' && Object.hasOwn(factoryClueLabels, clue)
    ? factoryClueLabels[clue] : clue;
}
