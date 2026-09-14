import type { CutoutSource } from './character-cutouts';

// These exact images and destinations have individual location decisions in
// formal-background-batch-20260911/red-plum-reuse-evidence.json.
// Pin the current story snapshot too, so later narrative changes require review.
const redPlumSource = '8d5aee61335ef980ec9caacafb154937d1468147852ad3b5fcb9d168fdb1dda6';
const tigerSource = '403aa0191ba58530b34012d0712e8289c68cadc8ed4d472fab52b420686abb7f';
const placements = [
  {
    worldId: 'red-plum', bindingSourceHash: redPlumSource,
    nodeId: '__art_environment_red-plum-arrival-environment',
    jobId: 'scene_35af2d5bdf4c27d6a5e92b47b02d',
    sourceHash: 'e4f75be5f3fa939a6c9aae96021b1734fa669a0554f5647fe36610c21b70731f',
    sha256: 'ceda84b21b285975b6d0883232a451ed60e025a57f17b03115b5b439cc3a12c6',
    nodeIds: ['arrival', 'field_0', 'puzzle_0', 'aftermath_0'],
  },
  {
    worldId: 'red-plum', bindingSourceHash: redPlumSource,
    nodeId: '__art_environment_red-plum-field_1-environment',
    jobId: 'scene_792e64c43741af9f7d05a29a506a',
    sourceHash: 'e4b5622fdeceb7f0fcef5aa448aebcfe0354fb1cfd9aaebd0c3348d4045a2a0a',
    sha256: '147a117a5fa5c6401b68f75aa3396d4c30580509ca17fb9834db8a99d58f460c',
    nodeIds: ['field_1', 'puzzle_1', 'aftermath_1'],
  },
  {
    worldId: 'red-plum', bindingSourceHash: redPlumSource,
    nodeId: '__art_environment_red-plum-field_2-environment',
    jobId: 'scene_6c3f44a1993aa4cb1de3de4248ba',
    sourceHash: '2670a4c73eb8ba03f0b1e52565d63602d0246ed0ed15eca908ba85f724bd409f',
    sha256: '8e935b4a3a456dad1c029438f58b60704a14c6e443f85f38226dadee90030e97',
    nodeIds: ['field_2', 'puzzle_2'],
  },
  // Each destination has a current scene decision in
  // process-lifetime-audit/tiger-exact-placement-20260913/placement-candidates.json.
  {
    worldId: 'tiger-shelter', bindingSourceHash: tigerSource,
    nodeId: '__art_environment_north-new-den',
    jobId: 'scene_d49bebf79ac731606fdd2308e8bf',
    sourceHash: 'd152bef39b8ae2ef86d874506a4c6d95622c9710e7e57aab078a097bd5a87b64',
    sha256: '3101c9f9fc5c1706da0dbc974f1d1e33fa73b8f49c3e983533d5c86aae3b2f35',
    nodeIds: ['b_mountain_good', 'b_mountain_small'],
  },
  {
    worldId: 'tiger-shelter', bindingSourceHash: tigerSource,
    nodeId: '__art_environment_ridge-signal',
    jobId: 'scene_56f77de0b3addfc2362968423d0c',
    sourceHash: '7887437e3a46f86814a27e7ec5fa032b90a02ccda9e13798aa25427d3dffec5c',
    sha256: 'aea06439c891f02cf2506a6c5db8060c218ef740efdfb1e045401abefa8d7683',
    // b_signal was individually rejected for its changed scene constraints.
    nodeIds: ['b_border_dawn'],
  },
  // Current scene decisions: placement-next-two-20260913/placement-candidates.json.
  {
    worldId: 'harvest-box', bindingSourceHash: '439c4095f9e1c7034bf3356ad79b86a389c0a8e53f996a22e9b2bea913493ed6',
    nodeId: '__art_environment_temporary-dike',
    jobId: 'scene_f22991d07ae557b842fd30b78b13',
    sourceHash: 'e67d7c50afa6afcb2fad2843fa95cf8ef19f81abc403d33b0053cbe040677b40',
    sha256: '98c1490fee1e2878e286a46cc99ba0029ed0fc9ffba1ea2c33dd3c5e78421418',
    nodeIds: ['sect_dike'],
  },
  {
    worldId: 'ming-whisper', bindingSourceHash: '3e1371728e644988a40c5966dab7276898e7ba4a105eee4de20e8deb535e4f92',
    nodeId: '__art_environment_canal-lock',
    jobId: 'scene_d661f57a45e7ef2d6581bd638126',
    sourceHash: '0b4936fce448ef86e963f9fc32831cdbc51f282a6514c56e7262835b674aea50',
    sha256: 'ae711ac457633b38c1e49bb1fd50917306381ae65e47db185a9b35d9ffdf42f1',
    nodeIds: ['canal_checkpoint'],
  },
  // placement-following-two-20260913: bridge width is unproven; the other
  // medicine scene retains its reviewed CG without adding an environment variant.
  {
    worldId: 'hollow-immortals', bindingSourceHash: '43a06a0ffd304da00782a35af52fff30c8fcdb13cbdb224fa3be58324a1f3060',
    nodeId: '__art_environment_ravine-bridge',
    jobId: 'scene_fa9b4505a8780e3fbb64e9c612db',
    sourceHash: '0eee217d4c1a815a458b026aff070cbb802631757d8793a30c0484e0e6022d2a',
    sha256: '472f9bf7136cebce7c0353f9064bae9c4088c16d26df1a818d17dae1f1f92eb9',
    nodeIds: ['b_copper_stairs'],
  },
  {
    worldId: 'wrong-realm', bindingSourceHash: 'e3067ad28e7dc13eec2a17bbb6e2af35d9ee95ff5ad69ac60aabad190fd73026',
    nodeId: '__art_environment_herbal-dispensary',
    jobId: 'scene_898fa562a5bd6bab8a4f3bc5e680',
    sourceHash: 'f05b5a028ee110cecbb5a9aa69b1d042b70f274370ce50db86630e01e75993f8',
    sha256: '2b8ef849aed1adeebd9bc0b3dfa5558e33721b88860e147afc59296318d2f201',
    nodeIds: ['b_herbalist'],
  },
  // old-courtyard-exact-placement-20260913: ship location is wrong and the
  // abandoned courtyard is unsupported for both occupied homes; keep all CGs.
  {
    worldId: 'palace-ledger', bindingSourceHash: 'a40debf8f5ee1093b0fa6e2a0a8751b7f07ade0955f577d228cffc2d64b14611',
    nodeId: '__art_environment_old-courtyard',
    jobId: 'scene_a608fd150e1d908224d415bec451',
    sourceHash: '58c68c60b16d35b8a466e26f79566150e4c6ae9cbf965409c4b5c3655890661c',
    sha256: '408f140fb66cb13b065f7930fa0c41694af6fb4590e31ffd75b2b6feb057bbef',
    nodeIds: [],
  },
  // placement-next-four-20260913: daylight checkpoint only; later shop CGs
  // retain their composition without an added environment variant.
  {
    worldId: 'ming-whisper', bindingSourceHash: '3e1371728e644988a40c5966dab7276898e7ba4a105eee4de20e8deb535e4f92',
    nodeId: '__art_environment_post-gate',
    jobId: 'scene_09928d307956d3941ec9b56bf1a0',
    sourceHash: 'ec8417cf259d32e0113be292b0d95d2301f72e6baecedaa3c602dc0f2b7c7eed',
    sha256: '4f86b25a5721d3571a0a75fa21723e7e522f49e0c412ab0f4eb9f42ba63282c7',
    nodeIds: ['cart_check'],
  },
  {
    worldId: 'palace-ledger', bindingSourceHash: 'a40debf8f5ee1093b0fa6e2a0a8751b7f07ade0955f577d228cffc2d64b14611',
    nodeId: '__art_environment_city-shop',
    jobId: 'scene_9ba43cf6bef4f101394f0e10daa7',
    sourceHash: '95cd4f8afbbc6421649b0321e40e579da71f543b7dfb5de78d1942f25adb7c8f',
    sha256: '5e72dc309403c846901191ae37c66c37195bcc180b043e02e727c49bfc3ae46e',
    nodeIds: ['b_city_shop'],
  },
  // placement-batch-05/06-20260913: individually matched opening moments;
  // the other published destinations retain their existing CGs.
  {
    worldId: 'harvest-box', bindingSourceHash: '439c4095f9e1c7034bf3356ad79b86a389c0a8e53f996a22e9b2bea913493ed6',
    nodeId: '__art_environment_farm-main-hall',
    jobId: 'scene_301f6e88ff63f171070052823fdd',
    sourceHash: '3af3332efbfb51b95dc2ce14c9004c9a817f671c8a4a93bea268d6dcb7abd033',
    sha256: 'd7649d29229c2f7558d5c8118c1beb774bf21174feeca20a6934c562b76093b8',
    nodeIds: ['separation'],
  },
  {
    worldId: 'palace-ledger', bindingSourceHash: 'a40debf8f5ee1093b0fa6e2a0a8751b7f07ade0955f577d228cffc2d64b14611',
    nodeId: '__art_environment_palace-gate',
    jobId: 'scene_e36652fe63ce6b42b87b2bf0f0f7',
    sourceHash: 'd76dd8d0c8c48b9fa46b6987a04ce7438494071216bd48ccb125dfcb3e8c5b05',
    sha256: 'ebfd9cf5d7077517f3eb1459702157de109e7c106eeb3c59399fa16ad27220b4',
    nodeIds: ['field_3'],
  },
  // new-approved-held-1833: wages remain undecided in the office; the keeper
  // speaks in the rear lane. Four other targets keep their composed CG only.
  {
    worldId: 'palace-ledger', bindingSourceHash: 'a40debf8f5ee1093b0fa6e2a0a8751b7f07ade0955f577d228cffc2d64b14611',
    nodeId: '__art_environment_servant-office',
    jobId: 'scene_a40a2da1a3aaf1eafde673cd3e26',
    sourceHash: '15963a726780bb85896ce8693c5dfded90c93691be2073e329326863e0b77047',
    sha256: 'fb977b97de55c04f436324c9671a6d293239b4c5de9684566ab8d09b409d047c',
    nodeIds: ['ending_budget', 'b_pay_servants'],
  },
  {
    worldId: 'tiger-shelter', bindingSourceHash: tigerSource,
    nodeId: '__art_environment_relay-kitchen',
    jobId: 'scene_16f0a90f0d1631ad9b3644c1b93f',
    sourceHash: '8abe7e45b4af3df4d9984b9356cfef4aa4c4e0f5c8525aad3d6f9ceec412cc27',
    sha256: '7bc38ffc594b5aa4eb5e5cdc69dc7fcbf64cb39180bf9f7ead12a7a488044dd9',
    nodeIds: ['b_keeper'],
  },
  {
    worldId: 'tiger-shelter', bindingSourceHash: tigerSource,
    nodeId: '__art_environment_lee-stone-nest',
    jobId: 'scene_c2dd3159485a270507cea0e2b8d0',
    sourceHash: 'c3c5d7c620b7bd61bb27c79cde3be7751c0b17e48bd71b1f4259c47561615ef6',
    sha256: '290236543c2265dc38806ec9dddf5f6a07dcab716da0c35690d8190948f928b1',
    nodeIds: [],
  },
  // batch06 companion native evidence was formally adopted on September 13;
  // batch07 night school applies only to the class before the rain is repaired.
  {
    worldId: 'rotten-pilgrimage', bindingSourceHash: 'e0dc37f5abd21de7612f44515be20a061d9f2134cac5cd32175a1d1839a9a055',
    nodeId: '__art_environment_old-ferry',
    jobId: 'scene_723073dba00fd7f8c36686a76b9a',
    sourceHash: '3c0c1a1047555217b0e96198e69a3c5aca3b5154d3a35fb47c736cb801d2fdf2',
    sha256: 'ccc65e94b60790d62e796e6c2176c1b313a5087325cfa12010ef2c34d746674d',
    nodeIds: ['companion'],
  },
  {
    worldId: 'six-roots', bindingSourceHash: '2ff05fa5ebbf76348bdc764650f70e4147ebee380af183f3eff10335cb1329bf',
    nodeId: '__art_environment_ancestral-night-school',
    jobId: 'scene_c9d2981dd829ce87fe8fcc464359',
    sourceHash: '04189171908c6acc52bb79db8ef0004133adfd61674b2976a4c97feef3fb8a1b',
    sha256: '8fda549ecf4946e195804adab576a417b7ae607d93bd1652f110709a67e51a45',
    nodeIds: ['b_rain_class'],
  },
  // hollow-native-evidence-1909 and full64-review-10: exact empty locations;
  // the gate departure and both sideyard moments retain their composed CGs.
  {
    worldId: 'hollow-immortals', bindingSourceHash: '43a06a0ffd304da00782a35af52fff30c8fcdb13cbdb224fa3be58324a1f3060',
    nodeId: '__art_environment_practice-court',
    jobId: 'scene_3102b2e2332d4d5487d8d7eb34dc',
    sourceHash: '7f9be7baeb2738374c2aec5fe03b18b91e4fb3fabf7c2b7517a3cbc2a31da457',
    sha256: '973fd6537e02a78db8b5991aaa1c9052e323bca9d3433dd371c4f826fc35427b',
    nodeIds: ['field_1', 'field_2'],
  },
  {
    worldId: 'tiger-shelter', bindingSourceHash: tigerSource,
    nodeId: '__art_environment_city-gate',
    jobId: 'scene_0a80d298fa7915dc59ef063117db',
    sourceHash: '1725895ae1c02b54466ad10dff624d4dc2c0252bf5f610f5321617a964b76b99',
    sha256: 'a07290b9940ad474990cec8e1c4dfa876a38dd4cdb79adfa808fe34a9699df9a',
    nodeIds: ['b_gate'],
  },
  {
    worldId: 'tiger-shelter', bindingSourceHash: tigerSource,
    nodeId: '__art_environment_imperial-sideyard',
    jobId: 'scene_5e7a7bbdea16208812fd6da3c8a1',
    sourceHash: '034516524c671fcc033af4b1cae6deca6be255efd40ef7dab8c3115c3a43f192',
    sha256: '4effbdf7d8cbad83a2e714c392fb46dadfdeb1007d9a4178a8b2c0d2df81986a',
    nodeIds: [],
  },
];

export function verifiedEnvironmentNodeIds(worldId: string, bindingSourceHash: string,
  asset: CutoutSource, publishedNodeIds: string[]): string[] | undefined {
  const evidence = placements.find(row => row.worldId === worldId && row.nodeId === asset.nodeId);
  if (!evidence) return undefined;
  if (bindingSourceHash !== evidence.bindingSourceHash || evidence.jobId !== asset.jobId
    || evidence.sourceHash !== asset.sourceHash || evidence.sha256 !== asset.asset.sha256
    || asset.asset.url !== `/generated-art/${evidence.jobId}.png`) return [];
  return evidence.nodeIds.filter(id => publishedNodeIds.includes(id));
}
