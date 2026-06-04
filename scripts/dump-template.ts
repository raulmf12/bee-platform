import { buildBeeQuoteTemplateConfig } from '../src/lib/templates/beeQuote';
const cfg = buildBeeQuoteTemplateConfig('portrait');
console.log(JSON.stringify(cfg));
