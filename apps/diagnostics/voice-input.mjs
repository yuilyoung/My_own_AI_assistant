// Session-bound workflow. A transcript goes to the composer, never directly to a tool/LLM.
export class VoiceInput {
  constructor({recorder, request, onResult = () => {}, onState = () => {}, onError = () => {}, interval = 250}) {
    Object.assign(this, {recorder, request, onResult, onState, onError, interval});
    this.epoch = 0; this.kind = 'idle'; this.active = null; this.controller = null;
  }
  state(kind) { this.kind = kind; this.onState(kind); }
  deleteJob(job) {
    return this.request(`/sessions/${job.sid}/transcriptions/${job.id}`, {method: 'DELETE'}).catch(() => {});
  }
  cancel() {
    this.epoch++; this.recorder.cancel(); this.controller?.abort(); this.controller = null;
    const job = this.active; this.active = null;
    if (job) void this.deleteJob(job);
    this.state('idle');
  }
  async start(sid) {
    this.cancel(); this.sid = sid;
    const epoch = this.epoch;
    this.state('opening');
    try {
      await this.recorder.start(() => {
        if (this.epoch === epoch && this.kind === 'recording') {
          this.finish().catch(error => { if (this.epoch === epoch) this.onError(error); });
        }
      });
      if (this.epoch === epoch) this.state('recording');
    } catch (error) {
      if (this.epoch === epoch) { this.state('idle'); throw error; }
    }
  }
  async finish() {
    if (this.kind !== 'recording') return;
    const epoch = this.epoch, sid = this.sid;
    const current = () => this.epoch === epoch;
    this.state('transcribing');
    let job = null;
    try {
      const wav = await this.recorder.finish();
      if (!current()) return;
      // Do not abort job creation: its eventual ID is needed to cancel a stale job.
      const created = await this.request(`/sessions/${sid}/transcriptions`, {
        method: 'POST', headers: {'Content-Type': 'audio/wav'}, body: wav,
      });
      job = {sid, id: created.id};
      if (!current()) return;
      this.active = job;
      const controller = new AbortController(); this.controller = controller;
      while (current()) {
        const result = await this.request(`/sessions/${sid}/transcriptions/${job.id}`, {signal: controller.signal});
        if (!current()) return;
        if (result.status === 'completed') { this.onResult(result.text); return; }
        if (result.status === 'cancelled') return;
        if (!['queued', 'transcribing'].includes(result.status)) {
          throw new Error('음성 인식에 실패했습니다. 로컬 whisper.cpp와 모델 설정을 확인하세요.');
        }
        await new Promise(resolve => setTimeout(resolve, this.interval));
      }
    } catch (error) {
      if (current()) throw error;
    } finally {
      if (job) await this.deleteJob(job);
      if (current()) { this.active = null; this.controller = null; this.state('idle'); }
    }
  }
}
