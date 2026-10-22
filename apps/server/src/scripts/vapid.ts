import webpush from 'web-push';

// Gera um par de chaves VAPID novo para colar no .env.
const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_SUBJECT=mailto:contato@dominomanezinho.app');
