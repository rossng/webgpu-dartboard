# WebGPU Dartboard Expected Score Calculator

This project computes the expected score when aiming at a given point on a dartboard, given a 2D Gaussian distribution of where throws will land.

## How it works

The dartboard is divided into areas with different scores. To calculate the expected score for a given aim point:

1. Model throw accuracy as a 2D Gaussian distribution centered at the aim point
2. For each position on the dartboard, multiply the probability of hitting that position by its score
3. Sum these probability-weighted scores to get the expected score

This approach accounts for the uncertainty in throwing accuracy and the varying scores across the dartboard regions.