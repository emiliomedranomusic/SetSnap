const crypto = require('crypto');

class JobQueue {
    constructor(concurrencyLimit) {
        this.concurrencyLimit = concurrencyLimit;
        this.activeCount = 0;
        this.queue = [];
    }

    async add(taskFn, retries = 3, retryDelayMs = 2000) {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                let attempt = 0;
                while (attempt <= retries) {
                    try {
                        const result = await taskFn();
                        resolve(result);
                        return; // Exito
                    } catch (err) {
                        const isRateLimit = (err.status === 429 || err.statusCode === 429 || (err.message && err.message.includes('429')));
                        if (isRateLimit && attempt < retries) {
                            attempt++;
                            const backoff = retryDelayMs * Math.pow(2, attempt - 1); // Exponential backoff
                            console.log(`[Queue] Gemini rate limited (429). Reintentando en ${backoff}ms (Intento ${attempt}/${retries})...`);
                            await new Promise(r => setTimeout(r, backoff));
                        } else {
                            reject(err);
                            return; // Falla definitiva
                        }
                    }
                }
            });
            this.processNext();
        });
    }

    async processNext() {
        if (this.activeCount >= this.concurrencyLimit || this.queue.length === 0) {
            return;
        }
        this.activeCount++;
        const job = this.queue.shift();
        try {
            await job();
        } finally {
            this.activeCount--;
            this.processNext();
        }
    }
}

module.exports = JobQueue;
