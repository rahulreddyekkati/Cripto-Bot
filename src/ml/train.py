"""
XGBoost Training Script with Calibration
Trains a classifier to predict if a coin will go up >1% in 24h.
Outputs calibrated probability model.
"""

import pandas as pd
import numpy as np
from sklearn.model_selection import TimeSeriesSplit
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import classification_report, brier_score_loss
from xgboost import XGBClassifier
import joblib
import json
from pathlib import Path
import sqlite3
from datetime import datetime, timedelta

# Paths
BASE_DIR = Path(__file__).parent.parent.parent
DATA_DIR = BASE_DIR / 'data'
MODEL_DIR = Path(__file__).parent

class CryptoModelTrainer:
    def __init__(self):
        self.model = None
        self.calibrated_model = None
        self.feature_columns = [
            # Technical indicators
            'rsi', 'macd', 'macd_signal', 'macd_histogram',
            'ema_20', 'ema_50', 'atr', 'atr_percent',
            'bb_position', 'volume_ratio',
            
            # Trend features
            'price_vs_ema20', 'price_vs_ema50',
            'ema20_trend', 'ema50_trend',
            'price_above_ema20', 'price_above_ema50',
            'ema20_above_ema50',
            
            # Momentum
            'momentum_24h', 'momentum_7d',
            
            # Market context
            'market_cap_tier', 'volatility_tier',
            'btc_correlation', 'market_regime'
        ]
        
    def load_training_data(self, db_path=None):
        """Load historical data from SQLite database"""
        if db_path is None:
            db_path = DATA_DIR / 'crypto.db'
        
        # For initial training, we'll generate synthetic data
        # In production, this would query actual historical predictions and outcomes
        print("Generating training data from historical patterns...")
        return self._generate_synthetic_training_data()
    
    def _generate_synthetic_training_data(self, n_samples=10000):
        """
        Generate realistic synthetic training data for initial model.
        In production, replace with actual historical data.
        """
        np.random.seed(42)
        
        data = {
            'rsi': np.random.uniform(20, 80, n_samples),
            'macd': np.random.uniform(-0.5, 0.5, n_samples),
            'macd_signal': np.random.uniform(-0.3, 0.3, n_samples),
            'volume_ratio': np.random.uniform(0.5, 3.0, n_samples),
            'atr_percent': np.random.uniform(1, 10, n_samples),
            'bb_position': np.random.uniform(0, 1, n_samples),
            'price_vs_ema20': np.random.uniform(-5, 5, n_samples),
            'price_vs_ema50': np.random.uniform(-10, 10, n_samples),
            'momentum_24h': np.random.uniform(-10, 10, n_samples),
            'momentum_7d': np.random.uniform(-20, 20, n_samples),
            'market_cap_tier': np.random.choice([0, 1, 2], n_samples),  # small, mid, large
            'volatility_tier': np.random.choice([0, 1, 2], n_samples),
            'btc_correlation': np.random.uniform(0.3, 0.9, n_samples),
            'market_regime': np.random.choice([0, 1, 2], n_samples),  # risk_off, neutral, risk_on
        }
        
        # Derived features
        data['macd_histogram'] = np.array(data['macd']) - np.array(data['macd_signal'])
        data['ema_20'] = np.random.uniform(100, 10000, n_samples)
        data['ema_50'] = data['ema_20'] * np.random.uniform(0.9, 1.1, n_samples)
        data['atr'] = data['ema_20'] * data['atr_percent'] / 100
        data['ema20_trend'] = np.random.choice([0, 1, 2], n_samples)  # down, neutral, up
        data['ema50_trend'] = np.random.choice([0, 1, 2], n_samples)
        data['price_above_ema20'] = (np.array(data['price_vs_ema20']) > 0).astype(int)
        data['price_above_ema50'] = (np.array(data['price_vs_ema50']) > 0).astype(int)
        data['ema20_above_ema50'] = (np.array(data['ema_20']) > np.array(data['ema_50'])).astype(int)
        
        df = pd.DataFrame(data)
        
        # Generate realistic target based on pattern logic
        # Bullish conditions increase probability of >1% return
        prob = 0.5  # base probability
        scores = (
            (df['rsi'].between(50, 70)).astype(float) * 0.1 +
            (df['rsi'] < 30).astype(float) * 0.05 +  # oversold bounce
            (df['rsi'] > 80).astype(float) * -0.15 +  # overbought reversal
            (df['macd_histogram'] > 0).astype(float) * 0.08 +
            (df['volume_ratio'] > 1.5).astype(float) * 0.12 +
            (df['volume_ratio'] > 2.0).astype(float) * 0.05 +
            (df['price_above_ema20'] == 1).astype(float) * 0.1 +
            (df['ema20_trend'] == 2).astype(float) * 0.08 +  # up trend
            (df['momentum_24h'] > 2).astype(float) * 0.06 +
            (df['bb_position'].between(0.3, 0.7)).astype(float) * 0.05 +
            (df['market_regime'] == 2).astype(float) * 0.08 -  # risk_on
            (df['market_regime'] == 0).astype(float) * 0.1  # risk_off
        )
        
        final_prob = np.clip(prob + scores, 0.1, 0.9)
        df['target'] = (np.random.random(n_samples) < final_prob).astype(int)
        
        # Add some noise
        noise_idx = np.random.choice(n_samples, int(n_samples * 0.1), replace=False)
        df.loc[noise_idx, 'target'] = 1 - df.loc[noise_idx, 'target']
        
        print(f"Generated {len(df)} samples, positive rate: {df['target'].mean():.2%}")
        return df
    
    def prepare_features(self, df):
        """Prepare feature matrix for training"""
        feature_cols = [col for col in self.feature_columns if col in df.columns]
        X = df[feature_cols].fillna(0)
        y = df['target'] if 'target' in df.columns else None
        return X, y, feature_cols
    
    def train(self, df):
        """Train XGBoost model with time-series cross-validation"""
        X, y, feature_cols = self.prepare_features(df)
        
        print(f"Training on {len(X)} samples with {len(feature_cols)} features...")
        
        # XGBoost base model
        self.model = XGBClassifier(
            n_estimators=100,
            max_depth=6,
            learning_rate=0.1,
            min_child_weight=3,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            eval_metric='logloss'
        )
        
        # Time-series cross-validation
        tscv = TimeSeriesSplit(n_splits=5)
        
        # Calibrated model with isotonic regression
        self.calibrated_model = CalibratedClassifierCV(
            self.model,
            method='isotonic',
            cv=tscv
        )
        
        self.calibrated_model.fit(X, y)
        
        # Evaluate
        y_pred = self.calibrated_model.predict(X)
        y_prob = self.calibrated_model.predict_proba(X)[:, 1]
        
        print("\n=== Training Results ===")
        print(classification_report(y, y_pred))
        print(f"Brier Score: {brier_score_loss(y, y_prob):.4f}")
        
        # Feature importance from base model
        self.model.fit(X, y)
        importance = pd.DataFrame({
            'feature': feature_cols,
            'importance': self.model.feature_importances_
        }).sort_values('importance', ascending=False)
        
        print("\n=== Top 10 Features ===")
        print(importance.head(10).to_string(index=False))
        
        return self.calibrated_model
    
    def save_model(self, name='crypto_model'):
        """Save trained model and metadata"""
        if self.calibrated_model is None:
            raise ValueError("No trained model to save")
        
        # Save model
        model_path = MODEL_DIR / f'{name}.pkl'
        joblib.dump(self.calibrated_model, model_path)
        print(f"Saved model to {model_path}")
        
        # Save metadata
        metadata = {
            'version': '1.0',
            'trained_at': datetime.now().isoformat(),
            'features': self.feature_columns,
            'target': 'price_up_1pct_24h'
        }
        
        meta_path = MODEL_DIR / f'{name}_meta.json'
        with open(meta_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        print(f"Saved metadata to {meta_path}")
        
        return model_path, meta_path
    
    def load_model(self, name='crypto_model'):
        """Load trained model"""
        model_path = MODEL_DIR / f'{name}.pkl'
        meta_path = MODEL_DIR / f'{name}_meta.json'
        
        self.calibrated_model = joblib.load(model_path)
        
        with open(meta_path, 'r') as f:
            metadata = json.load(f)
        
        self.feature_columns = metadata['features']
        
        return self.calibrated_model, metadata


def main():
    print("=" * 50)
    print("Crypto Model Training")
    print("=" * 50)
    
    trainer = CryptoModelTrainer()
    
    # Load or generate training data
    df = trainer.load_training_data()
    
    # Train model
    model = trainer.train(df)
    
    # Save model
    trainer.save_model()
    
    print("\n✅ Training complete!")
    print("Run the inference server: python inference.py")


if __name__ == '__main__':
    main()
