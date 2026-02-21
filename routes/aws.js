'use strict';
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { exec } = require('child_process');
const express = require('express');
const { S3_BUCKET, S3_REGION, S3_PREFIX } = require('../lib/config');

const execPromise = promisify(exec);
const router = express.Router();

// ── GET /api/aws/services ─────────────────────────────────────────────────────

router.get('/services', async (req, res) => {
  try {
    let account = { id: 'unknown', region: S3_REGION };
    try {
      const { stdout } = await execPromise('aws sts get-caller-identity --output json 2>/dev/null');
      const sts = JSON.parse(stdout);
      account.id = sts.Account;
      account.user = sts.Arn.split('/').pop();
    } catch {
      // AWS CLI unavailable or no credentials — use defaults
    }

    const services = [];
    const checks = [
      { name: 'Amazon Bedrock', cmd: 'aws bedrock list-foundation-models --query "length(modelSummaries)" --output text 2>/dev/null', desc: 'Foundation models (Opus, Sonnet, Haiku)', parse: (v) => `${v.trim()} models available` },
      { name: 'Amazon Polly', cmd: 'aws polly describe-voices --query "length(Voices)" --output text 2>/dev/null', desc: 'Text-to-speech (Neural voices)', parse: (v) => `${v.trim()} voices` },
      { name: 'Amazon Transcribe', cmd: 'aws transcribe list-transcription-jobs --max-results 1 --output json 2>/dev/null', desc: 'Speech-to-text', parse: () => 'Ready' },
      { name: 'Amazon Translate', cmd: 'aws translate list-languages --query "length(Languages)" --output text 2>/dev/null', desc: 'Translation (75+ languages)', parse: (v) => `${v.trim()} languages` },
      { name: 'Amazon S3', cmd: S3_BUCKET ? `aws s3api head-bucket --bucket ${S3_BUCKET} 2>/dev/null && echo ok` : 'echo none', desc: `Storage (${S3_BUCKET || 'not configured'})`, parse: () => S3_BUCKET ? 'Bucket active' : 'Not configured' },
    ];

    for (const svc of checks) {
      try {
        const { stdout } = await execPromise(svc.cmd, { timeout: 5000 });
        services.push({ name: svc.name, status: 'active', description: svc.desc, detail: svc.parse(stdout) });
      } catch {
        services.push({ name: svc.name, status: 'available', description: svc.desc, detail: 'Not tested' });
      }
    }

    res.json({
      account,
      services,
      credits: { total: 25000, note: 'AWS Activate credits' },
    });
  } catch (error) {
    console.error('[AWS services]', error.message);
    res.status(500).json({ error: 'Failed to load AWS services' });
  }
});

// ── GET /api/aws/bedrock-models ───────────────────────────────────────────────

router.get('/bedrock-models', async (req, res) => {
  try {
    const { stdout } = await execPromise(
      'aws bedrock list-foundation-models --query "modelSummaries[?modelLifecycle.status==\'ACTIVE\'].{modelId:modelId,modelName:modelName,provider:providerName,input:inputModalities,output:outputModalities}" --output json 2>/dev/null',
      { timeout: 10000 }
    );
    const models = JSON.parse(stdout || '[]');
    res.json(models.map(m => ({
      modelId: m.modelId,
      modelName: m.modelName,
      provider: m.provider,
      status: 'ACTIVE',
      inputModalities: m.input,
      outputModalities: m.output,
    })));
  } catch (error) {
    console.error('[Bedrock models]', error.message);
    res.status(500).json({ error: 'Failed to load Bedrock models' });
  }
});

// ── POST /api/aws/generate-image ──────────────────────────────────────────────

router.post('/generate-image', async (req, res) => {
  try {
    const { modelId, prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    const timestamp = Date.now();
    let payload;

    if (modelId.startsWith('amazon.nova-canvas') || modelId.startsWith('amazon.titan-image')) {
      payload = {
        taskType: 'TEXT_IMAGE',
        textToImageParams: { text: prompt },
        imageGenerationConfig: { numberOfImages: 1, height: 1024, width: 1024 },
      };
    } else if (modelId.startsWith('stability.')) {
      payload = { prompt, mode: 'text-to-image', output_format: 'png' };
    } else {
      return res.status(400).json({ error: `Unsupported image model: ${modelId}` });
    }

    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    const outFile = `/tmp/mc-image-${timestamp}.json`;

    await execPromise(
      `aws bedrock-runtime invoke-model --model-id "${modelId}" --content-type "application/json" --accept "application/json" --body "${payloadB64}" ${outFile}`,
      { timeout: 60000 }
    );

    const result = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    const imageB64 = result.images?.[0] || result.image;
    if (!imageB64) {
      return res.status(500).json({ error: 'No image in response', keys: Object.keys(result) });
    }

    const slug = prompt.replace(/[^a-zA-Z0-9]+/g, '-').substring(0, 40).toLowerCase();
    const filename = `${timestamp}-${slug}.png`;
    const localPath = `/tmp/mc-image-${timestamp}.png`;
    fs.writeFileSync(localPath, Buffer.from(imageB64, 'base64'));

    const s3Key = `${S3_PREFIX}/${filename}`;
    await execPromise(`aws s3 cp "${localPath}" "s3://${S3_BUCKET}/${s3Key}" --content-type image/png`, { timeout: 30000 });

    try { fs.unlinkSync(outFile); } catch {
      // temp file cleanup — non-fatal
    }

    res.json({
      ok: true,
      message: 'Image generated and saved to S3!',
      imageUrl: `/api/aws/image/${timestamp}`,
      s3: `s3://${S3_BUCKET}/${s3Key}`,
    });
  } catch (error) {
    console.error('[Image gen]', error.message);
    res.status(500).json({ error: error.message || 'Image generation failed' });
  }
});

// ── GET /api/aws/image/:id ────────────────────────────────────────────────────

router.get('/image/:id', (req, res) => {
  const imgPath = `/tmp/mc-image-${req.params.id}.png`;
  if (fs.existsSync(imgPath)) {
    res.type('png').sendFile(imgPath);
  } else {
    res.status(404).json({ error: 'Image not found locally — check S3' });
  }
});

// ── GET /api/aws/gallery ──────────────────────────────────────────────────────

router.get('/gallery', async (req, res) => {
  try {
    const { stdout } = await execPromise(
      `aws s3api list-objects-v2 --bucket ${S3_BUCKET} --prefix "${S3_PREFIX}/" --output json 2>/dev/null`,
      { timeout: 10000 }
    );
    const data = JSON.parse(stdout);
    const images = (data.Contents || [])
      .filter(o => o.Key.endsWith('.png'))
      .map(o => {
        const filename = o.Key.split('/').pop();
        const id = filename.split('-')[0];
        return { id, url: `/api/aws/s3-image/${encodeURIComponent(o.Key)}`, created: o.LastModified, size: o.Size, s3Key: o.Key };
      })
      .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
    res.json({ images });
  } catch (error) {
    console.warn('[Gallery] S3 unavailable, falling back to local /tmp:', error.message);
    try {
      const files = fs.readdirSync('/tmp')
        .filter(f => f.startsWith('mc-image-') && f.endsWith('.png'))
        .map(f => {
          const id = f.replace('mc-image-', '').replace('.png', '');
          const stat = fs.statSync(`/tmp/${f}`);
          return { id, url: `/api/aws/image/${id}`, created: stat.mtime.toISOString(), size: stat.size };
        })
        .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
      res.json({ images: files });
    } catch (e) {
      console.error('[Gallery] Local fallback also failed:', e.message);
      res.json({ images: [] });
    }
  }
});

// ── GET /api/aws/s3-image/:key ────────────────────────────────────────────────

router.get('/s3-image/:key(*)', async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);
    const localCache = `/tmp/s3-cache-${key.replace(/\//g, '_')}`;
    if (!fs.existsSync(localCache)) {
      await execPromise(`aws s3 cp "s3://${S3_BUCKET}/${key}" "${localCache}"`, { timeout: 15000 });
    }
    res.type('png').sendFile(localCache);
  } catch (error) {
    console.error('[S3 image proxy]', error.message);
    res.status(404).json({ error: 'Image not found' });
  }
});

// ── GET /api/aws/costs ────────────────────────────────────────────────────────

router.get('/costs', async (req, res) => {
  try {
    const startDate = new Date();
    startDate.setDate(1);
    const start = startDate.toISOString().split('T')[0];
    const end = new Date().toISOString().split('T')[0];

    const { stdout } = await execPromise(
      `aws ce get-cost-and-usage --time-period Start=${start},End=${end} --granularity DAILY --metrics BlendedCost --group-by Type=DIMENSION,Key=SERVICE --output json 2>/dev/null`,
      { timeout: 15000 }
    );
    const data = JSON.parse(stdout);

    const services = {};
    const daily = [];
    let total = 0;

    for (const r of (data.ResultsByTime || [])) {
      const day = r.TimePeriod.Start;
      let dayTotal = 0;
      for (const g of (r.Groups || [])) {
        const svc = g.Keys[0];
        const amt = parseFloat(g.Metrics.BlendedCost.Amount);
        if (amt > 0.001) { services[svc] = (services[svc] || 0) + amt; dayTotal += amt; }
      }
      daily.push({ date: day, cost: Math.round(dayTotal * 100) / 100 });
      total += dayTotal;
    }

    const serviceList = Object.entries(services)
      .map(([name, cost]) => ({ name, cost: Math.round(cost * 100) / 100 }))
      .sort((a, b) => b.cost - a.cost);

    res.json({
      period: { start, end },
      total: Math.round(total * 100) / 100,
      daily,
      services: serviceList,
      credits: 25000,
      remaining: Math.round((25000 - total) * 100) / 100,
    });
  } catch (error) {
    console.error('[AWS costs]', error.message);
    res.status(500).json({ error: 'Failed to load cost data' });
  }
});

module.exports = router;
