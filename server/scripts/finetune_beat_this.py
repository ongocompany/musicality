#!/usr/bin/env python3
"""
Fine-tune Beat This! small model on Latin dance music.

Uses Madmom-labeled data (prepared by prepare_finetune_data.py) to teach
Beat This! Latin-specific rhythm patterns. Knowledge distillation approach:
slow-but-accurate Madmom → fast Beat This! model.

Usage:
    python scripts/finetune_beat_this.py \
        --data-dir /mnt/nvme/finetune_data \
        --output-dir /mnt/nvme/finetune_checkpoints \
        --base-model small0 \
        --epochs 30 \
        --batch-size 4 \
        --lr 0.0002
"""
import argparse
import logging
import sys
from pathlib import Path

import numpy as np
import torch
# PyTorch 2.6+ requires explicit allowlisting for numpy types in checkpoints
torch.serialization.add_safe_globals([np.core.multiarray.scalar])
import pytorch_lightning as pl
from pytorch_lightning.callbacks import ModelCheckpoint, EarlyStopping

from beat_this.inference import load_checkpoint
from beat_this.model.pl_module import PLBeatThis
from beat_this.dataset.dataset import BeatDataModule

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                    datefmt="%H:%M:%S")
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="Fine-tune Beat This! on Latin dance data")
    parser.add_argument("--data-dir", required=True, help="Data directory from prepare_finetune_data.py")
    parser.add_argument("--output-dir", required=True, help="Directory to save checkpoints")
    parser.add_argument("--base-model", default="small0", help="Base model checkpoint (default: small0)")
    parser.add_argument("--epochs", type=int, default=30, help="Number of training epochs (default: 30)")
    parser.add_argument("--batch-size", type=int, default=4, help="Batch size (default: 4, lower for CPU)")
    parser.add_argument("--lr", type=float, default=0.0002, help="Learning rate (default: 0.0002, lower than pretrain)")
    parser.add_argument("--device", default="cpu", help="Device: cpu or cuda:0 (default: cpu)")
    parser.add_argument("--num-workers", type=int, default=4, help="DataLoader workers (default: 4)")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # ── Load base model checkpoint ────────────────────────────────
    logger.info(f"Loading base model: {args.base_model}")
    checkpoint = load_checkpoint(args.base_model, device="cpu")
    hparams = checkpoint["hyper_parameters"]

    # Override training hyperparameters for fine-tuning
    hparams["lr"] = args.lr
    hparams["max_epochs"] = args.epochs
    hparams["warmup_steps"] = 100  # shorter warmup for fine-tuning

    # Create model with pretrained weights
    model = PLBeatThis(**hparams)
    # Load pretrained state dict (strip "model." prefix from PL checkpoint)
    from beat_this.utils import replace_state_dict_key
    state_dict = replace_state_dict_key(checkpoint["state_dict"], "model.", "")
    model.model.load_state_dict(state_dict)
    logger.info("Pretrained weights loaded!")

    # ── Setup data ────────────────────────────────────────────────
    logger.info(f"Loading data from: {args.data_dir}")
    data = BeatDataModule(
        data_dir=args.data_dir,
        batch_size=args.batch_size,
        train_length=1500,  # ~30s at 50fps, same as original training
        num_workers=args.num_workers,
        augmentations={},  # no precomputed augmentations for now (only track.npy available)
        test_dataset="__none__",  # no separate test set — we use val for monitoring
        spect_fps=50,
        length_based_oversampling_factor=1,  # oversample longer songs proportionally
    )

    # ── Callbacks ─────────────────────────────────────────────────
    checkpoint_callback = ModelCheckpoint(
        dirpath=str(output_dir),
        filename="latin-beat-this-{epoch:02d}-{val_loss:.4f}",
        save_top_k=3,
        monitor="val_loss",
        mode="min",
        save_last=True,
    )

    early_stop = EarlyStopping(
        monitor="val_loss",
        patience=8,
        mode="min",
        verbose=True,
    )

    # ── Trainer ───────────────────────────────────────────────────
    accelerator = "gpu" if "cuda" in args.device and torch.cuda.is_available() else "cpu"
    devices = 1

    trainer = pl.Trainer(
        accelerator=accelerator,
        devices=devices,
        max_epochs=args.epochs,
        callbacks=[checkpoint_callback, early_stop],
        log_every_n_steps=10,
        enable_progress_bar=True,
        default_root_dir=str(output_dir),
    )

    # ── Train ─────────────────────────────────────────────────────
    logger.info(f"Starting fine-tuning: {args.epochs} epochs, lr={args.lr}, batch_size={args.batch_size}")
    logger.info(f"Device: {accelerator}, Output: {output_dir}")
    trainer.fit(model, data)

    # ── Save final model in inference-friendly format ─────────────
    best_path = checkpoint_callback.best_model_path
    if best_path:
        logger.info(f"Best checkpoint: {best_path}")
        # Also save as standalone state dict for easy loading
        best_ckpt = torch.load(best_path, map_location="cpu", weights_only=False)
        inference_path = output_dir / "latin_beat_this_final.ckpt"
        torch.save(best_ckpt, inference_path)
        logger.info(f"Inference checkpoint saved: {inference_path}")
    else:
        logger.warning("No best checkpoint found!")

    logger.info("Fine-tuning complete!")


if __name__ == "__main__":
    main()
