export const aiState = {
  config: null,
  ui: null,
  conversations: [],
  activeChatId: null,
  aiFileKey: '',
  persistTimer: null,
  chat: {
    open: false,
    scope: null,
    title: '',
    subtitle: '',
    notice: '',
    baseSystem: '',
    messages: [],
    busy: false,
    controller: null,
    draft: '',
    chainUid: '',
    queue: [],
    cancelled: false,
    timedOut: false,
    scrollStick: true,
    rendering: false,
    attachments: []
  }
};
