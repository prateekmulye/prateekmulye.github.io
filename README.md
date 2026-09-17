# Prateek Mulye: engineering index

[Browse the index](https://prateekmulye.github.io/) or visit [the full portfolio](https://prateekmulye.dev/).

## Current applications

- [Payment Exception Desk](https://payments.prateekmulye.dev/)
- [Load Review](https://energy.prateekmulye.dev/)
- [Caption Review](https://captions.prateekmulye.dev/)

Seven records cover applied AI projects, backend systems and manufacturing software. Each record includes its source and limits. Employer work and personal projects are identified separately.

All records remain readable without JavaScript. Keyword search works without loading a model. Optional on-device search combines semantic matching with exact terms and returns existing records, never generated career claims. It can miss relevant work or return a weak match.

The bundled runtime and model assets total about 46.4 MB. Model setup starts only when requested. Search runs in a dedicated browser worker; cancel or setup failure leaves keyword search available. No account or paid API is required.

GitHub Pages serves the root of `main`. No site build step is needed. The source data is [evidence.json](./evidence.json); [asset-manifest.json](./asset-manifest.json) records the pinned runtime and model files with their hashes.

## Credits

- Transformers.js 3.8.1: [Apache 2.0 license](./vendor/LICENSE).
- ONNX Runtime: [MIT license](./vendor/onnx-LICENSE) and [third-party notices](./vendor/onnx-ThirdPartyNotices.txt).
- Xenova/all-MiniLM-L6-v2: [model card](./models/Xenova/all-MiniLM-L6-v2/README.md), Apache 2.0, revision `751bff37182d3f1213fa05d7196b954e230abad9`.
- Inter, Newsreader and JetBrains Mono: [Inter](./assets/inter-OFL.txt), [Newsreader](./assets/newsreader-OFL.txt) and [JetBrains Mono](./assets/jetbrainsmono-OFL.txt) SIL Open Font License notices.
