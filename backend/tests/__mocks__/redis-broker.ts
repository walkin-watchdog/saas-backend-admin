import { EventEmitter } from 'events';

type Handler = (message: string, channel: string) => void;

class Broker {
  private bus = new EventEmitter();
  private subs: { pattern: string; handler: Handler }[] = [];

  publish(channel: string, message: string) {
    // deliver to exact subscribers
    this.bus.emit(channel, message);
    // deliver to pattern subscribers (supports tenant:*:config-updated)
    for (const { pattern, handler } of this.subs) {
      // very small wildcard: * = one or more non-colon chars
      const regex = new RegExp('^' + pattern.replace(/\*/g, '[^:]+') + '$');
      if (regex.test(channel)) {
        handler(message, channel);
      }
    }
  }

  pSubscribe(pattern: string, handler: Handler) {
    this.subs.push({ pattern, handler });
  }
}

export const broker = new Broker();