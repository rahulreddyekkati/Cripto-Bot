"""
FastAPI Inference Server for Crypto Predictions
Loads trained model and serves probability predictions.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import numpy as np
import joblib
import json
from pathlib import Path

app = FastAPI(
    title="Crypto Prediction API",
    description="ML-powered crypto price direction predictions",
    version="1.0.0"
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load model on startup
MODEL_DIR = Path(__file__).parent
model = None
metadata = None
feature_columns = []


@app.on_event("startup")
async def load_model():
    global model, metadata, feature_columns
    
    model_path = MODEL_DIR / 'crypto_model.pkl'
    meta_path = MODEL_DIR / 'crypto_model_meta.json'
    
    if not model_path.exists():
        print("⚠️  No trained model found. Run train.py first.")
        return
    
    model = joblib.load(model_path)
    
    with open(meta_path, 'r') as f:
        metadata = json.load(f)
    
    feature_columns = metadata['features']
    print(f"✅ Loaded model v{metadata['version']} with {len(feature_columns)} features")


class CoinFeatures(BaseModel):
    """Input features for a single coin prediction"""
    coin_id: str
    rsi: float = 50.0
    macd: float = 0.0
    macd_signal: float = 0.0
    macd_histogram: float = 0.0
    ema_20: float = 0.0
    ema_50: float = 0.0
    atr: float = 0.0
    atr_percent: float = 3.0
    bb_position: float = 0.5
    volume_ratio: float = 1.0
    price_vs_ema20: float = 0.0
    price_vs_ema50: float = 0.0
    ema20_trend: int = 1  # 0=down, 1=neutral, 2=up
    ema50_trend: int = 1
    price_above_ema20: int = 1
    price_above_ema50: int = 1
    ema20_above_ema50: int = 1
    momentum_24h: float = 0.0
    momentum_7d: float = 0.0
    market_cap_tier: int = 1  # 0=small, 1=mid, 2=large
    volatility_tier: int = 1  # 0=low, 1=moderate, 2=high
    btc_correlation: float = 0.6
    market_regime: int = 1  # 0=risk_off, 1=neutral, 2=risk_on


class PredictionResult(BaseModel):
    """Output prediction for a coin"""
    coin_id: str
    probability: float
    confidence: str
    prediction: int  # 1 = up >1%, 0 = not


class BatchPredictionRequest(BaseModel):
    """Request for predicting multiple coins"""
    coins: List[CoinFeatures]


class BatchPredictionResponse(BaseModel):
    """Response with all predictions"""
    predictions: List[PredictionResult]
    model_version: str
    

@app.get("/health")
async def health_check():
    """Check if model is loaded and ready"""
    return {
        "status": "healthy" if model is not None else "no_model",
        "model_version": metadata.get('version') if metadata else None,
        "features_count": len(feature_columns)
    }


@app.post("/predict", response_model=PredictionResult)
async def predict_single(coin: CoinFeatures):
    """Predict probability for a single coin"""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded. Run train.py first.")
    
    # Convert to feature array
    features = _extract_features(coin)
    
    # Get probability
    prob = model.predict_proba([features])[0][1]
    prediction = int(prob >= 0.5)
    
    # Determine confidence level
    if prob >= 0.7:
        confidence = "high"
    elif prob >= 0.55:
        confidence = "medium"
    else:
        confidence = "low"
    
    return PredictionResult(
        coin_id=coin.coin_id,
        probability=round(prob, 4),
        confidence=confidence,
        prediction=prediction
    )


@app.post("/predict/batch", response_model=BatchPredictionResponse)
async def predict_batch(request: BatchPredictionRequest):
    """Predict probabilities for multiple coins"""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded. Run train.py first.")
    
    predictions = []
    
    for coin in request.coins:
        features = _extract_features(coin)
        prob = model.predict_proba([features])[0][1]
        prediction = int(prob >= 0.5)
        
        if prob >= 0.7:
            confidence = "high"
        elif prob >= 0.55:
            confidence = "medium"
        else:
            confidence = "low"
        
        predictions.append(PredictionResult(
            coin_id=coin.coin_id,
            probability=round(prob, 4),
            confidence=confidence,
            prediction=prediction
        ))
    
    # Sort by probability descending
    predictions.sort(key=lambda x: x.probability, reverse=True)
    
    return BatchPredictionResponse(
        predictions=predictions,
        model_version=metadata.get('version', 'unknown')
    )


def _extract_features(coin: CoinFeatures) -> list:
    """Extract feature array in correct order for model"""
    return [
        coin.rsi,
        coin.macd,
        coin.macd_signal,
        coin.macd_histogram,
        coin.ema_20,
        coin.ema_50,
        coin.atr,
        coin.atr_percent,
        coin.bb_position,
        coin.volume_ratio,
        coin.price_vs_ema20,
        coin.price_vs_ema50,
        coin.ema20_trend,
        coin.ema50_trend,
        coin.price_above_ema20,
        coin.price_above_ema50,
        coin.ema20_above_ema50,
        coin.momentum_24h,
        coin.momentum_7d,
        coin.market_cap_tier,
        coin.volatility_tier,
        coin.btc_correlation,
        coin.market_regime
    ]


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
