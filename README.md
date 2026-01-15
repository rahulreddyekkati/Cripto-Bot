# Crypto Prediction System

ML-powered crypto signals with calibrated probabilities and performance tracking.

## Quick Start

```bash
# Backend
npm install
npm run dev

# ML Training (first time)
cd src/ml
pip install -r requirements.txt
python train.py

# Frontend
cd frontend
npm install
npm run dev
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| GET /api/predictions | Top picks with confidence scores |
| GET /api/predictions/:id | Single coin details |
| GET /api/performance | Historical accuracy |
| GET /api/health | System status |

## Environment Variables

```env
COINGECKO_API_KEY=optional
PORT=3001
```

## Disclaimer

This is for educational/research purposes only. Crypto is volatile—predictions are probability-based signals, not guarantees.
