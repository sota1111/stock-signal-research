// SOT-949: English display translations for research-seed narrative DATA.
// Keyed by seed.id. Used only when lang === 'en'; falls back to the original
// Japanese seed fields when an id or field is missing. The backend data
// (backend/data/initial-research-seeds.json) is the source of truth and is unchanged.
export interface SeedTextEn {
  theme?: string
  summary?: string
  hypothesis?: string
  reason?: string
}

export const seedTextEn: Record<string, SeedTextEn> = {
  seed_nvidia_gpu: {
    theme: 'NVIDIA / GPU / Physical AI',
    summary:
      'NVIDIA sits at the core of data-center GPUs and the CUDA ecosystem. AI training and inference demand can be an early signal for GPU demand.',
    hypothesis:
      'Rising GPU memory / inference demand could be an early signal for NVIDIA-related stock moves (unverified).',
    reason: 'The center of AI infrastructure demand and the starting point of the supply chain.',
  },
  seed_physical_ai_robotics_fm: {
    theme: 'Physical AI / embodied AI',
    summary:
      'Robotics foundation models and sim2real may accelerate the real-world adoption of Physical AI.',
    hypothesis:
      'Progress in Physical AI / foundation models could be an early signal for robotics-related demand (unverified).',
    reason: "A user theme of interest (embodied AI) that may move together with GPU demand.",
  },
  seed_inference_kv_cache: {
    theme: 'Inference acceleration / KV cache offloading',
    summary:
      'KV-cache offloading for faster inference is a theme that ripples into I/O and memory demand.',
    hypothesis:
      'Wider adoption of inference-cost optimization could be an early signal for memory / storage demand (unverified).',
    reason: 'An intermediate theme in the supply chain (I/O → KV cache).',
  },
  seed_amd_ai_accelerator: {
    theme: 'Semiconductors / AI accelerator',
    summary:
      'AMD entered the AI accelerator market with the MI300 line. We want to track demand for an NVIDIA alternative.',
    hypothesis:
      'Expanding inference demand could be an early signal of demand for a second source (AMD) (unverified).',
    reason: 'A direct beneficiary candidate of AI infrastructure (existing seed benefit_score 80).',
  },
  seed_tsmc_semiconductor_capex: {
    theme: 'Semiconductors / foundry capex',
    summary:
      'TSMC advanced-node / CoWoS utilization can be an upstream early signal of AI-semiconductor demand.',
    hypothesis:
      'Changes in foundry utilization could be an early signal of GPU / accelerator supply (unverified).',
    reason: 'A direct beneficiary candidate upstream in the supply chain (existing seed benefit_score 88).',
  },
  seed_hbm_memory: {
    theme: 'Semiconductors / HBM',
    summary:
      'HBM is a bottleneck for GPU memory demand. Supply constraints and rising ASPs can be an early signal for memory makers.',
    hypothesis:
      'HBM supply constraints and rising ASPs could be an early signal for memory-related stocks (unverified).',
    reason: 'A memory-supply theme directly tied to GPU demand (existing seed precursor 78).',
  },
  seed_data_center_power: {
    theme: 'AI infrastructure / data-center power',
    summary:
      'Data-center power and cooling demand from GPU build-outs can be an early signal for peripheral infrastructure stocks.',
    hypothesis:
      'Rising AI compute demand could be an early signal for power / cooling infrastructure demand (unverified).',
    reason: 'A downstream theme in the supply chain (existing seed precursor 70).',
  },
  seed_tesla_autonomous: {
    theme: 'Autonomous driving / robotics',
    summary:
      "Tesla's autonomous driving (FSD), robotaxi, and humanoid (Optimus) are commercialization themes for Physical AI.",
    hypothesis:
      'Progress in autonomous driving / humanoids could be an early signal for Tesla-related moves (unverified, high uncertainty).',
    reason: 'A user theme of interest (autonomous driving / robotics).',
  },
  seed_robotics_middleware: {
    theme: 'Robotics / middleware',
    summary:
      'Adoption of robotics platforms such as ROS2 / Nav2 / RMF can be a leading indicator for industrial / service robot demand.',
    hypothesis:
      'Wider adoption of robotics middleware could be an early signal for related hardware demand (unverified).',
    reason: "Strongly related to the user's work / study themes (ROS2 / Nav2 / RMF).",
  },
  seed_ssd_nvme: {
    theme: 'Storage / SSD・NVMe',
    summary:
      'NVMe SSD demand from expanding AI data pipelines is a theme signaling emerging I/O bottlenecks.',
    hypothesis:
      'Rising AI storage demand could be an early signal for NVMe-related stocks (unverified).',
    reason: 'A constituent theme of the existing supply chain (existing seed precursor 72).',
  },
  seed_semicap_optical: {
    theme: 'Semiconductor equipment / optical comms',
    summary:
      'Semiconductor equipment and optical communications are indirect-beneficiary themes of AI-semiconductor capex. We want to track capital spending.',
    hypothesis:
      'Rising AI-semiconductor capex could be an early signal for indirect beneficiaries in equipment / optical comms (unverified).',
    reason: 'Indirect-beneficiary companies in the existing seed set (benefit_type indirect).',
  },
}
