export const STT_CATALOG = {
  "schema": 1,
  "models": [
    {
      "id": "paraformer",
      "name": "Paraformer 中文 INT8",
      "directory": "sherpa-onnx-paraformer-zh-int8-2025-10-07",
      "engine": "onnx",
      "version": "2025-10-07",
      "languages": "普通话",
      "artifacts": [
        {
          "sha256": "a071ee5419e14adb34d7f970ab98105a45e6608018b168f023ca2e4810744abe",
          "format": "tar.bz2",
          "destination": "sherpa-onnx-paraformer-zh-int8-2025-10-07.tar.bz2",
          "filename": "sherpa-onnx-paraformer-zh-int8-2025-10-07.tar.bz2"
        }
      ],
      "enabled": true
    },
    {
      "id": "sensevoice",
      "name": "SenseVoice Small INT8",
      "directory": "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09",
      "engine": "onnx",
      "version": "2025-09-09",
      "languages": "中文、粤语、英语、日语、韩语",
      "artifacts": [
        {
          "sha256": "7305f7905bfcf77fa0b39388a313f3da35c68d971661a65475b56fb2162c8e63",
          "format": "tar.bz2",
          "destination": "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09.tar.bz2",
          "filename": "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09.tar.bz2"
        }
      ],
      "enabled": true
    },
    {
      "id": "qwen06",
      "name": "Qwen3-ASR 0.6B INT8",
      "directory": "sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25",
      "engine": "onnx",
      "version": "2026-03-25",
      "languages": "30 种语言",
      "artifacts": [
        {
          "sha256": "393f8a14e2f5fb96746aaab342997a40641001fbd5bf9592a080a8329178ee96",
          "format": "tar.bz2",
          "destination": "sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25.tar.bz2",
          "filename": "sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25.tar.bz2"
        }
      ],
      "enabled": true
    },
    {
      "id": "qwen17",
      "name": "Qwen3-ASR 1.7B",
      "directory": "qwen3-asr-1.7b",
      "engine": "transformers",
      "version": "7278e1e70fe206f11671096ffdd38061171dd6e5",
      "languages": "30 种语言",
      "artifacts": [
        {
          "sha256": "5058416891bc47a2051557765997e8c42f8eb78a0e33c3e775bd17d4b0ba4d50",
          "format": "file",
          "destination": "qwen3-asr-1.7b/README.md",
          "filename": "README.md"
        },
        {
          "sha256": "75a8cfca24f00de72d796fbfed6858fc9614ef3dabd8696684cc3bc03a9c58ff",
          "format": "file",
          "destination": "qwen3-asr-1.7b/chat_template.json",
          "filename": "chat_template.json"
        },
        {
          "sha256": "2e74a751548b8ad7d7526d29365ad8144c345d8b412b1152d25dc6698452712f",
          "format": "file",
          "destination": "qwen3-asr-1.7b/config.json",
          "filename": "config.json"
        },
        {
          "sha256": "1da527824d81e07118facff437e03f2e24a23311e3bdeb2368973fe77e5f275c",
          "format": "file",
          "destination": "qwen3-asr-1.7b/generation_config.json",
          "filename": "generation_config.json"
        },
        {
          "sha256": "8831e4f1a044471340f7c0a83d7bd71306a5b867e95fd870f74d0c5308a904d5",
          "format": "file",
          "destination": "qwen3-asr-1.7b/merges.txt",
          "filename": "merges.txt"
        },
        {
          "sha256": "a4cd1f1a04d90b757dc7f7dd26254e69a013b19e80efe590a83c6a3bde8608d6",
          "format": "file",
          "destination": "qwen3-asr-1.7b/model-00001-of-00002.safetensors",
          "filename": "model-00001-of-00002.safetensors"
        },
        {
          "sha256": "6e0b9d9e09e2e0238e7ef3cc8a484ab387e91b90f1900bedf88bc92d7929ccfc",
          "format": "file",
          "destination": "qwen3-asr-1.7b/model-00002-of-00002.safetensors",
          "filename": "model-00002-of-00002.safetensors"
        },
        {
          "sha256": "f994739fe38e5210b9e3e8ce6c6307315e2ceac3cb630e7b7414d69dce520f60",
          "format": "file",
          "destination": "qwen3-asr-1.7b/model.safetensors.index.json",
          "filename": "model.safetensors.index.json"
        },
        {
          "sha256": "45e120a4eda2c20c5d7f2ea9354e63536bf35e27aa573fb7cdf78017b378770d",
          "format": "file",
          "destination": "qwen3-asr-1.7b/preprocessor_config.json",
          "filename": "preprocessor_config.json"
        },
        {
          "sha256": "4942d005604266809309cabc9f4e9cb89ce855d59b14681fdc0e1cc62ea26c4c",
          "format": "file",
          "destination": "qwen3-asr-1.7b/tokenizer_config.json",
          "filename": "tokenizer_config.json"
        },
        {
          "sha256": "ca10d7e9fb3ed18575dd1e277a2579c16d108e32f27439684afa0e10b1440910",
          "format": "file",
          "destination": "qwen3-asr-1.7b/vocab.json",
          "filename": "vocab.json"
        }
      ],
      "enabled": true
    }
  ],
  "runtimes": [
    {
      "id": "win32-x64-onnx-cpu",
      "version": "1",
      "platform": "win32",
      "arch": "x64",
      "engine": "onnx",
      "accelerator": "cpu",
      "python": {
        "sha256": "0f7defa7a0ed99b61e0df0bba5027474711521f1307cc3830c2f456401beeed5",
        "format": "tar.gz",
        "destination": "cpython-3.11.17+20261003-x86_64-pc-windows-msvc-install_only.tar.gz",
        "executable": "python/python.exe",
        "filename": "cpython-3.11.17+20261003-x86_64-pc-windows-msvc-install_only.tar.gz"
      },
      "wheels": [
        {
          "sha256": "e8213002e427c69c45a52bbd94163084025f533a55a59d6f9c5b820774ef3303",
          "destination": "numpy-2.2.6-cp311-cp311-win_amd64.whl",
          "filename": "numpy-2.2.6-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "6d67a2b4e7f14d8b31b8b52648866fa717f45a1eb70e83002f4331d07e953717",
          "destination": "pip-25.2-py3-none-any.whl",
          "filename": "pip-25.2-py3-none-any.whl"
        },
        {
          "sha256": "171e6fac715bae20e11829e8dbfc70ed990ede1b35e6332f8121b27691a002de",
          "destination": "sherpa_onnx-1.13.8-cp311-cp311-win_amd64.whl",
          "filename": "sherpa_onnx-1.13.8-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "5579e80196d516e6dae23c8f629292ce3142ab8869925d32b94612fd86f93733",
          "destination": "sherpa_onnx_core-1.13.8-py3-none-win_amd64.whl",
          "filename": "sherpa_onnx_core-1.13.8-py3-none-win_amd64.whl"
        }
      ],
      "packages": [
        "sherpa-onnx==1.13.8",
        "numpy==2.2.6"
      ],
      "dependenciesVerified": true,
      "enabled": true,
      "platformVerified": true
    },
    {
      "id": "win32-x64-transformers-cpu",
      "version": "1",
      "platform": "win32",
      "arch": "x64",
      "engine": "transformers",
      "accelerator": "cpu",
      "python": {
        "sha256": "0f7defa7a0ed99b61e0df0bba5027474711521f1307cc3830c2f456401beeed5",
        "format": "tar.gz",
        "destination": "cpython-3.11.17+20261003-x86_64-pc-windows-msvc-install_only.tar.gz",
        "executable": "python/python.exe",
        "filename": "cpython-3.11.17+20261003-x86_64-pc-windows-msvc-install_only.tar.gz"
      },
      "wheels": [
        {
          "sha256": "3e2091cd341423207e2f084a6654b1efcd250dc326f2a37d6dde446e07cabb11",
          "destination": "accelerate-1.12.0-py3-none-any.whl",
          "filename": "accelerate-1.12.0-py3-none-any.whl"
        },
        {
          "sha256": "117bac03a25ede5df5440e855b32d556049ca169ead221505badf432fed4b101",
          "destination": "annotated_doc-0.0.5-py3-none-any.whl",
          "filename": "annotated_doc-0.0.5-py3-none-any.whl"
        },
        {
          "sha256": "f072f4d804ea359e4eaf198b1af7a8b0943881a87f31bb764f8bf219bb9419e0",
          "destination": "annotated_types-0.8.0-py3-none-any.whl",
          "filename": "annotated_types-0.8.0-py3-none-any.whl"
        },
        {
          "sha256": "6152fdbbf9a77fdec97731721bebf7c4c44f7c29b424b0065826173efc7ed101",
          "destination": "anyio-4.15.1-py3-none-any.whl",
          "filename": "anyio-4.15.1-py3-none-any.whl"
        },
        {
          "sha256": "b30d1df6c5d3de5dcef0fb0e256f6ea17bdcf5f979408df0297d8a408e2971b4",
          "destination": "audioread-3.1.0-py3-none-any.whl",
          "filename": "audioread-3.1.0-py3-none-any.whl"
        },
        {
          "sha256": "ea1480b7a8d5405cb5f382b344731bf125fd2c1c6fae3964f6c48595628387ff",
          "destination": "av-18.1.0-cp311-abi3-win_amd64.whl",
          "filename": "av-18.1.0-cp311-abi3-win_amd64.whl"
        },
        {
          "sha256": "ba0efaa9080b619ff2f3459d1d500c57bddea4a6b424b60a91141db6fd2f08bc",
          "destination": "blinker-1.9.0-py3-none-any.whl",
          "filename": "blinker-1.9.0-py3-none-any.whl"
        },
        {
          "sha256": "022426c9e99fd65d9475dce5c195526f04bb8be8907607e27e747893f6ee3e24",
          "destination": "brotli-1.2.0-cp311-cp311-win_amd64.whl",
          "filename": "brotli-1.2.0-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "62f22742b58a1a33014a2b6b706588a8d7e2a88ae7bd1a6ebe8c992928483775",
          "destination": "certifi-2026.7.22-py3-none-any.whl",
          "filename": "certifi-2026.7.22-py3-none-any.whl"
        },
        {
          "sha256": "42f6930c31dc7f50732c9ae793c2786c7b6b044195967bbdde40bb9be81c4cc0",
          "destination": "cffi-2.1.1-cp311-cp311-win_amd64.whl",
          "filename": "cffi-2.1.1-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "87e50a3e7cb90af586b6c5faf23e302a970415ac73bd7bd90a515a04b427ef96",
          "destination": "charset_normalizer-3.5.2-cp311-cp311-win_amd64.whl",
          "filename": "charset_normalizer-3.5.2-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "255bc9599cf7748b4b1a446ccc735421bd08a2ae529a8b88597d3de5664ee360",
          "destination": "click-8.5.0-py3-none-any.whl",
          "filename": "click-8.5.0-py3-none-any.whl"
        },
        {
          "sha256": "9acb47f6afd73f60dc1df93bb801b472f05ff42fa6c84167d25cb206be1fbf4a",
          "destination": "cloudpickle-3.1.2-py3-none-any.whl",
          "filename": "cloudpickle-3.1.2-py3-none-any.whl"
        },
        {
          "sha256": "4f1d9991f5acc0ca119f9d443620b77f9d6b33703e51011c16baf57afb285fc6",
          "destination": "colorama-0.4.6-py2.py3-none-any.whl",
          "filename": "colorama-0.4.6-py2.py3-none-any.whl"
        },
        {
          "sha256": "8566ea804cfc265f5e9dda71d1b716aa24ee4c3423a5da4b28a248a78c33e3f9",
          "destination": "cython-3.3.0-cp311-cp311-win_amd64.whl",
          "filename": "cython-3.3.0-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "f47fe6fdbd2edd623ecfe36875d37aba411624e2670dd395dddae1358689bb3c",
          "destination": "decorator-5.3.1-py3-none-any.whl",
          "filename": "decorator-5.3.1-py3-none-any.whl"
        },
        {
          "sha256": "3d5a88d2ea7b518b422d57b3fbc123cd7f42e78c80357736f6f7b8f179fac6d9",
          "destination": "dynet38-2.2-cp311-cp311-win_amd64.whl",
          "filename": "dynet38-2.2-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "bd5f4d81f1e93a88bcd77caf4dfe3c2dbffc3805407a0007e9a114c18b3a670b",
          "destination": "fastapi-0.142.2-py3-none-any.whl",
          "filename": "fastapi-0.142.2-py3-none-any.whl"
        },
        {
          "sha256": "7f0ca4bcc0e181c60dbbd8aa9ab5b120ebb99e4e064e83636340056f833a1f09",
          "destination": "filelock-3.32.3-py3-none-any.whl",
          "filename": "filelock-3.32.3-py3-none-any.whl"
        },
        {
          "sha256": "5f17ee83ecee8a6f3e389c75822fb70a1c2f0506b99438a6dffa1d56793588c8",
          "destination": "filelock-4.0.12-py3-none-any.whl",
          "filename": "filelock-4.0.12-py3-none-any.whl"
        },
        {
          "sha256": "f4bcbefc124291925f1a26446da31a5178f9483862233b23c0c96a20701f670c",
          "destination": "flask-3.1.3-py3-none-any.whl",
          "filename": "flask-3.1.3-py3-none-any.whl"
        },
        {
          "sha256": "b57ddbafedfaef7018c1ecab32aa200a9d7ca26b77965f64e48b70061249d279",
          "destination": "fsspec-2026.7.0-py3-none-any.whl",
          "filename": "fsspec-2026.7.0-py3-none-any.whl"
        },
        {
          "sha256": "8dd6e646e99ea382bd85f97a45e6b526a442d79423a7dc673f1e2756d05fcb5f",
          "destination": "fsspec-2026.9.0-py3-none-any.whl",
          "filename": "fsspec-2026.9.0-py3-none-any.whl"
        },
        {
          "sha256": "7e52c65bfbb7bd75ac1c28cb38f93b01e5f6a2ff013224e6213533451bfee517",
          "destination": "gradio-6.17.3-py3-none-any.whl",
          "filename": "gradio-6.17.3-py3-none-any.whl"
        },
        {
          "sha256": "d43e2179c29076292a76485ad7ed2e6eaa19d14ac58283bd7f5beabfe4ca958c",
          "destination": "gradio_client-2.5.0-py3-none-any.whl",
          "filename": "gradio_client-2.5.0-py3-none-any.whl"
        },
        {
          "sha256": "7f7975bab18c729a257a8b1ae9dcd70b7cafb1720481beae47719af57c35fa64",
          "destination": "groovy-0.1.2-py3-none-any.whl",
          "filename": "groovy-0.1.2-py3-none-any.whl"
        },
        {
          "sha256": "63cf8bbe7522de3bf65932fda1d9c2772064ffb3dae62d55932da54b31cb6c86",
          "destination": "h11-0.16.0-py3-none-any.whl",
          "filename": "h11-0.16.0-py3-none-any.whl"
        },
        {
          "sha256": "76b8cb8be6abe62d74c1ad2d35b42f0629db89aa9e1a8d033cecfe7c856eeab3",
          "destination": "hf_gradio-0.4.1-py3-none-any.whl",
          "filename": "hf_gradio-0.4.1-py3-none-any.whl"
        },
        {
          "sha256": "2d400746a40668fc9dec9810239072b40b4484b640a8c38fd654a024c7a1bf55",
          "destination": "httpcore-1.0.9-py3-none-any.whl",
          "filename": "httpcore-1.0.9-py3-none-any.whl"
        },
        {
          "sha256": "d909fcccc110f8c7faf814ca82a9a4d816bc5a6dbfea25d6591d6985b8ba59ad",
          "destination": "httpx-0.28.1-py3-none-any.whl",
          "filename": "httpx-0.28.1-py3-none-any.whl"
        },
        {
          "sha256": "48f0c8eac16145dfce371e9d2d7772854a4f591bcb56c9cf548accf531d54270",
          "destination": "huggingface_hub-0.36.2-py3-none-any.whl",
          "filename": "huggingface_hub-0.36.2-py3-none-any.whl"
        },
        {
          "sha256": "ab7ae7122974553370f0bdb919e1a960b2cd1bc1ef0276416d896db81c14582c",
          "destination": "idna-3.20-py3-none-any.whl",
          "filename": "idna-3.20-py3-none-any.whl"
        },
        {
          "sha256": "c6242fc49e35958c8b15141343aa660db5fc54d4f13a1db01a3f5891b98700ef",
          "destination": "itsdangerous-2.2.0-py3-none-any.whl",
          "filename": "itsdangerous-2.2.0-py3-none-any.whl"
        },
        {
          "sha256": "85ece4451f492d0c13c5dd7c13a64681a86afae63a5f347908daf103ce6d2f67",
          "destination": "jinja2-3.1.6-py3-none-any.whl",
          "filename": "jinja2-3.1.6-py3-none-any.whl"
        },
        {
          "sha256": "3dbbf9f6e4b592a2357b854608e980fe6390d131d7a82f011a377ef2ebef7aba",
          "destination": "joblib-1.6.0-py3-none-any.whl",
          "filename": "joblib-1.6.0-py3-none-any.whl"
        },
        {
          "sha256": "77253be3391b06124a0e16105bd663b6c54470af1a9ca8e1cf026f38d58ed056",
          "destination": "lazy_loader-0.6-py3-none-any.whl",
          "filename": "lazy_loader-0.6-py3-none-any.whl"
        },
        {
          "sha256": "0b6415c4fd68bff4c29288abe67c6d80b587e0e1e2cfb0aad23e4559504a7fa1",
          "destination": "librosa-0.11.0-py3-none-any.whl",
          "filename": "librosa-0.11.0-py3-none-any.whl"
        },
        {
          "sha256": "ffe46ef508df226e54b5fe1f7bf11122e5297bcdbb3902cc5b670a429d56ff47",
          "destination": "llvmlite-0.50.0-cp311-cp311-win_amd64.whl",
          "filename": "llvmlite-0.50.0-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "9f7ebbcd14fe59494226453aed97c1070d83f8d24b6fc3a3bcf9a38092641c4a",
          "destination": "markdown_it_py-4.2.0-py3-none-any.whl",
          "filename": "markdown_it_py-4.2.0-py3-none-any.whl"
        },
        {
          "sha256": "de8a88e63464af587c950061a5e6a67d3632e36df62b986892331d4620a35c01",
          "destination": "markupsafe-3.0.3-cp311-cp311-win_amd64.whl",
          "filename": "markupsafe-3.0.3-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "fdb4ca07ab75ffadab4a8b135ad59cdbb3156b99310f3d565370da74a15d6bd3",
          "destination": "markupsafe-3.0.4-cp311-cp311-win_amd64.whl",
          "filename": "markupsafe-3.0.4-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "84008a41e51615a49fc9966191ff91509e3c40b939176e643fd50a5c2196b8f8",
          "destination": "mdurl-0.1.2-py3-none-any.whl",
          "filename": "mdurl-0.1.2-py3-none-any.whl"
        },
        {
          "sha256": "a0b2b9fe80bbcd81a6647ff13108738cfb482d481d826cc0e02f5b35e5c88d2c",
          "destination": "mpmath-1.3.0-py3-none-any.whl",
          "filename": "mpmath-1.3.0-py3-none-any.whl"
        },
        {
          "sha256": "30e1522e4173230dca4d9ad896f038f73c0da6c1edd42f4dbad88ac583cf5d46",
          "destination": "msgpack-1.2.3-cp311-cp311-win_amd64.whl",
          "filename": "msgpack-1.2.3-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "551f8060e0208bbc80ab8766f923568b2cdbe49d47012cc0d29a310de0bd3a32",
          "destination": "nagisa-0.2.11-cp311-cp311-win_amd64.whl",
          "filename": "nagisa-0.2.11-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "29326d74f107c347fd1009bd58e38d9f7c7c5b51e6de97bc93dbc325d9038b54",
          "destination": "narwhals-2.26.0-py3-none-any.whl",
          "filename": "narwhals-2.26.0-py3-none-any.whl"
        },
        {
          "sha256": "d47fbf302e7d9cbbb9e2555a0d267983d2aa476bac30e90dfbe5669bd57f3762",
          "destination": "networkx-3.6.1-py3-none-any.whl",
          "filename": "networkx-3.6.1-py3-none-any.whl"
        },
        {
          "sha256": "d36f7c6a07c27fa175f5a4683083c6a830f7791fbda592a8676ce47a444965f7",
          "destination": "numba-0.68.0-cp311-cp311-win_amd64.whl",
          "filename": "numba-0.68.0-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "e8213002e427c69c45a52bbd94163084025f533a55a59d6f9c5b820774ef3303",
          "destination": "numpy-2.2.6-cp311-cp311-win_amd64.whl",
          "filename": "numpy-2.2.6-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "80e068aba7cd56c8b58512d6a36f8d25cb1dfaa0c0a4cc1c938ccf9f362d9cb3",
          "destination": "opentelemetry_api-1.45.0-py3-none-any.whl",
          "filename": "opentelemetry_api-1.45.0-py3-none-any.whl"
        },
        {
          "sha256": "fb2539159dfe8d371914f354360fa50e4a577cc89222a3828b9650a5e5040252",
          "destination": "orjson-3.12.0-cp311-cp311-win_amd64.whl",
          "filename": "orjson-3.12.0-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "d7193f7c8e4e93f444fde0262bf90af30e16fa0ad0ad44cb553c87339b23cd1c",
          "destination": "packaging-26.3-py3-none-any.whl",
          "filename": "packaging-26.3-py3-none-any.whl"
        },
        {
          "sha256": "2e5fa32ff162dfdbc280157d664f44d23049ae414725af9676df339c501d82cd",
          "destination": "pandas-3.0.6-cp311-cp311-win_amd64.whl",
          "filename": "pandas-3.0.6-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "8e95e1385e4998ae9694eeaa4730ba5457ff61185b3a55e2e7bea0880aef452a",
          "destination": "pillow-12.3.0-cp311-cp311-win_amd64.whl",
          "filename": "pillow-12.3.0-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "6d67a2b4e7f14d8b31b8b52648866fa717f45a1eb70e83002f4331d07e953717",
          "destination": "pip-25.2-py3-none-any.whl",
          "filename": "pip-25.2-py3-none-any.whl"
        },
        {
          "sha256": "080f3b39423b5abfca9a23d84c4e9795f54d395cd8459867a8ded44084fcd5f8",
          "destination": "platformdirs-4.12.3-py3-none-any.whl",
          "filename": "platformdirs-4.12.3-py3-none-any.whl"
        },
        {
          "sha256": "f265597baa9f760d25ceb29d0beb8186c243d6607b0f60b83ecf14078dbc703b",
          "destination": "pooch-1.9.0-py3-none-any.whl",
          "filename": "pooch-1.9.0-py3-none-any.whl"
        },
        {
          "sha256": "eb7e81434c8d223ec4a219b5fc1c47d0417b12be7ea866e24fb5ad6e84b3d988",
          "destination": "psutil-7.2.2-cp37-abi3-win_amd64.whl",
          "filename": "psutil-7.2.2-cp37-abi3-win_amd64.whl"
        },
        {
          "sha256": "b727414169a36b7d524c1c3e31839a521725078d7b2ff038656844266160a992",
          "destination": "pycparser-3.0-py3-none-any.whl",
          "filename": "pycparser-3.0-py3-none-any.whl"
        },
        {
          "sha256": "346a034f080da3755d8e9cb5e00e8b07de1d39e4f6e2c87d8ab7cafa0b269a73",
          "destination": "pydantic-2.13.5-py3-none-any.whl",
          "filename": "pydantic-2.13.5-py3-none-any.whl"
        },
        {
          "sha256": "40375c2d05acec10323e45dfe2077ac44bc74659008614af5069034e2cfc781c",
          "destination": "pydantic_core-2.46.5-cp311-cp311-win_amd64.whl",
          "filename": "pydantic_core-2.46.5-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "65617e33033874b59d87db603aa1ed450633288aefead953b30bded59cb599a6",
          "destination": "pydub-0.25.1-py2.py3-none-any.whl",
          "filename": "pydub-0.25.1-py2.py3-none-any.whl"
        },
        {
          "sha256": "2363c69b61c4a97c838da3b130dcd6468f4848992b21a82f2a63ec34377137d9",
          "destination": "pygments-2.21.0-py3-none-any.whl",
          "filename": "pygments-2.21.0-py3-none-any.whl"
        },
        {
          "sha256": "a8b2bc7bffae282281c8140a97d3aa9c14da0b136dfe83f850eea9a5f7470427",
          "destination": "python_dateutil-2.9.0.post0-py2.py3-none-any.whl",
          "filename": "python_dateutil-2.9.0.post0-py2.py3-none-any.whl"
        },
        {
          "sha256": "ff6d3f776f16878c894e52e107296ffc890e913c611b1a4ec6c44e2821fe2e23",
          "destination": "python_multipart-0.0.32-py3-none-any.whl",
          "filename": "python_multipart-0.0.32-py3-none-any.whl"
        },
        {
          "sha256": "e658af3757f9e26a9d25dd2aff38335acd92bc9104f890a894b2c1ba28311b03",
          "destination": "pytz-2026.5-py2.py3-none-any.whl",
          "filename": "pytz-2026.5-py2.py3-none-any.whl"
        },
        {
          "sha256": "9f3bfb4965eb874431221a3ff3fdcddc7e74e3b07799e0e84ca4a0f867d449bf",
          "destination": "pyyaml-6.0.3-cp311-cp311-win_amd64.whl",
          "filename": "pyyaml-6.0.3-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "b9c55a38413298f3a990a4475467399daec6e8f4172363053fc42e2166c2dfd3",
          "destination": "qwen_asr-0.0.6-py3-none-any.whl",
          "filename": "qwen_asr-0.0.6-py3-none-any.whl"
        },
        {
          "sha256": "f111db07af669c83333411c5177131e18e831fe666d6a55a1af263952ada8939",
          "destination": "qwen_omni_utils-0.0.9-py3-none-any.whl",
          "filename": "qwen_omni_utils-0.0.9-py3-none-any.whl"
        },
        {
          "sha256": "1043aedf5917caa861bcb25a9c11460049656bdf0017a90a309fa8f255467725",
          "destination": "regex-2026.9.29-cp311-cp311-win_amd64.whl",
          "filename": "regex-2026.9.29-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "2a0d60c172f83ac6ab31e4554906c0f3b3588d37b5cb939b1c061f4907e278e0",
          "destination": "requests-2.34.2-py3-none-any.whl",
          "filename": "requests-2.34.2-py3-none-any.whl"
        },
        {
          "sha256": "33bd4ef74232fb73fe9279a257718407f169c09b78a87ad3d296f548e27de0bb",
          "destination": "rich-15.0.0-py3-none-any.whl",
          "filename": "rich-15.0.0-py3-none-any.whl"
        },
        {
          "sha256": "c4f4a162db6993464d7ca3d7cc4af0ffc6515a606dfd220b9f82c6945d869cde",
          "destination": "safehttpx-0.1.7-py3-none-any.whl",
          "filename": "safehttpx-0.1.7-py3-none-any.whl"
        },
        {
          "sha256": "096ec1a98435df7beb08853bb5aa9081a84f23d0adc67ed1a0a10550f608373f",
          "destination": "safetensors-0.8.0-cp310-abi3-win_amd64.whl",
          "filename": "safetensors-0.8.0-cp310-abi3-win_amd64.whl"
        },
        {
          "sha256": "220fa18152852a5ce29c49e1eaba9d44ec44631cd2e5cf65f5a40eafa5ab3412",
          "destination": "scikit_learn-1.9.1-cp311-cp311-win_amd64.whl",
          "filename": "scikit_learn-1.9.1-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "d30e57c72013c2a4fe441c2fcb8e77b14e152ad48b5464858e07e2ad9fbfceff",
          "destination": "scipy-1.17.1-cp311-cp311-win_amd64.whl",
          "filename": "scipy-1.17.1-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "de78a3b8e0feda74cabc54aab2da702113e33ac9d9eb9d2389bcf1f58b7d9177",
          "destination": "semantic_version-2.10.0-py2.py3-none-any.whl",
          "filename": "semantic_version-2.10.0-py2.py3-none-any.whl"
        },
        {
          "sha256": "7ecfff8f2fd72616f7481040475a65b2bf8af90a56c89140852d1120324e8686",
          "destination": "shellingham-1.5.4-py2.py3-none-any.whl",
          "filename": "shellingham-1.5.4-py2.py3-none-any.whl"
        },
        {
          "sha256": "171e6fac715bae20e11829e8dbfc70ed990ede1b35e6332f8121b27691a002de",
          "destination": "sherpa_onnx-1.13.8-cp311-cp311-win_amd64.whl",
          "filename": "sherpa_onnx-1.13.8-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "5579e80196d516e6dae23c8f629292ce3142ab8869925d32b94612fd86f93733",
          "destination": "sherpa_onnx_core-1.13.8-py3-none-win_amd64.whl",
          "filename": "sherpa_onnx_core-1.13.8-py3-none-win_amd64.whl"
        },
        {
          "sha256": "4721f391ed90541fddacab5acf947aa0d3dc7d27b2e1e8eda2be8970586c3274",
          "destination": "six-1.17.0-py2.py3-none-any.whl",
          "filename": "six-1.17.0-py2.py3-none-any.whl"
        },
        {
          "sha256": "299491d3499460fb1b74bb4bd78b57ffc2d243a5fafa7b6ec1b264875c78453e",
          "destination": "soundfile-0.14.0-py2.py3-none-win_amd64.whl",
          "filename": "soundfile-0.14.0-py2.py3-none-win_amd64.whl"
        },
        {
          "sha256": "54a4a89ab8b6153cbf61ed6297ac836face23d8664a6efefc557a22ed448bc6f",
          "destination": "sox-1.5.0-py3-none-any.whl",
          "filename": "sox-1.5.0-py3-none-any.whl"
        },
        {
          "sha256": "ae30c48ac795378cf23ba3c7c640b8ff794af714ac388b9fd6b31a40b39e6e86",
          "destination": "soxr-1.1.0-cp311-cp311-win_amd64.whl",
          "filename": "soxr-1.1.0-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "2aed0ced1f0f74f7bdd0bdc24a979c5cb9ee4a28393642db52a83d174ed65b7a",
          "destination": "soynlp-0.0.493-py3-none-any.whl",
          "filename": "soynlp-0.0.493-py3-none-any.whl"
        },
        {
          "sha256": "67f8e99895493dd2911a03f11314af6ceebeae4e704bb9f43dfc6a9db151c93e",
          "destination": "starlette-1.7.0-py3-none-any.whl",
          "filename": "starlette-1.7.0-py3-none-any.whl"
        },
        {
          "sha256": "e091cc3e99d2141a0ba2847328f5479b05d94a6635cb96148ccb3f34671bd8f5",
          "destination": "sympy-1.14.0-py3-none-any.whl",
          "filename": "sympy-1.14.0-py3-none-any.whl"
        },
        {
          "sha256": "cd8b60b5641b45c67bbf73c64c843235fc2d8a480c87389f52f5dbee893b86be",
          "destination": "threadpoolctl-3.7.0-py3-none-any.whl",
          "filename": "threadpoolctl-3.7.0-py3-none-any.whl"
        },
        {
          "sha256": "c9ea31edff2968b44a88f97d784c2f16dc0729b8b143ed004699ebca91f05c48",
          "destination": "tokenizers-0.22.2-cp39-abi3-win_amd64.whl",
          "filename": "tokenizers-0.22.2-cp39-abi3-win_amd64.whl"
        },
        {
          "sha256": "592064ed85b40fa213469f81ac584f67a4f2992509a7c3ea2d632208623a3680",
          "destination": "tomlkit-0.14.0-py3-none-any.whl",
          "filename": "tomlkit-0.14.0-py3-none-any.whl"
        },
        {
          "sha256": "7631ef49fbd38d382909525b83696dc12a55d68492ade4ace3883c62b9fc140f",
          "destination": "torch-2.8.0+cpu-cp311-cp311-win_amd64.whl",
          "filename": "torch-2.8.0+cpu-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "c293e525e6fef9c20e8728fd4612df02a0aa31bb5fe91ecd93e123b1b7bffa73",
          "destination": "tqdm-4.70.1-py3-none-any.whl",
          "filename": "tqdm-4.70.1-py3-none-any.whl"
        },
        {
          "sha256": "4c9e9de11333ddfe5114bc872c9f370509198acf0b87a832a0ab9458e2bd0550",
          "destination": "transformers-4.57.6-py3-none-any.whl",
          "filename": "transformers-4.57.6-py3-none-any.whl"
        },
        {
          "sha256": "b3a5fc4342d5fc8fda8fc3010b1cf117e9249aab7fae800c2eff62fd3842d97d",
          "destination": "typer-0.27.2-py3-none-any.whl",
          "filename": "typer-0.27.2-py3-none-any.whl"
        },
        {
          "sha256": "481caa481374e813c1b176ada14e97f1f67a4539ce9cfeb3f350d78d6370c2e8",
          "destination": "typing_extensions-4.16.0-py3-none-any.whl",
          "filename": "typing_extensions-4.16.0-py3-none-any.whl"
        },
        {
          "sha256": "65b8397ba37ccbce054456aaccddfc91e6e3083c92824df348d96ca832f3f147",
          "destination": "typing_inspection-0.4.4-py3-none-any.whl",
          "filename": "typing_inspection-0.4.4-py3-none-any.whl"
        },
        {
          "sha256": "b683bd1b6659ddcd810ff02ad09ba821d4bf1065072805063eb35c49617905ac",
          "destination": "tzdata-2026.5-py2.py3-none-any.whl",
          "filename": "tzdata-2026.5-py2.py3-none-any.whl"
        },
        {
          "sha256": "0cf3cae568d36aa9576b28dfb35f11328f1cb974ca7647d9475ebb86c75ac6e3",
          "destination": "urllib3-2.8.0-py3-none-any.whl",
          "filename": "urllib3-2.8.0-py3-none-any.whl"
        },
        {
          "sha256": "505bdb0f318731d45f1f712071fc781a8981f6847a31c902c9f5e652d4f67faf",
          "destination": "uvicorn-0.54.0-py3-none-any.whl",
          "filename": "uvicorn-0.54.0-py3-none-any.whl"
        },
        {
          "sha256": "6392e50c78460ba618e5b21f08a71f59c99ce99cdc6cf6e3dd7e6ccca8754fab",
          "destination": "werkzeug-3.1.9-py3-none-any.whl",
          "filename": "werkzeug-3.1.9-py3-none-any.whl"
        }
      ],
      "packages": [
        "sherpa-onnx==1.13.8",
        "numpy==2.2.6",
        "torch==2.8.0+cpu",
        "qwen-asr==0.0.6",
        "huggingface-hub>=0.30"
      ],
      "dependenciesVerified": true,
      "enabled": true,
      "platformVerified": true
    },
    {
      "id": "win32-x64-transformers-cuda",
      "version": "1",
      "platform": "win32",
      "arch": "x64",
      "engine": "transformers",
      "accelerator": "cuda",
      "python": {
        "sha256": "0f7defa7a0ed99b61e0df0bba5027474711521f1307cc3830c2f456401beeed5",
        "format": "tar.gz",
        "destination": "cpython-3.11.17+20261003-x86_64-pc-windows-msvc-install_only.tar.gz",
        "executable": "python/python.exe",
        "filename": "cpython-3.11.17+20261003-x86_64-pc-windows-msvc-install_only.tar.gz"
      },
      "wheels": [
        {
          "sha256": "3e2091cd341423207e2f084a6654b1efcd250dc326f2a37d6dde446e07cabb11",
          "destination": "accelerate-1.12.0-py3-none-any.whl",
          "filename": "accelerate-1.12.0-py3-none-any.whl"
        },
        {
          "sha256": "117bac03a25ede5df5440e855b32d556049ca169ead221505badf432fed4b101",
          "destination": "annotated_doc-0.0.5-py3-none-any.whl",
          "filename": "annotated_doc-0.0.5-py3-none-any.whl"
        },
        {
          "sha256": "f072f4d804ea359e4eaf198b1af7a8b0943881a87f31bb764f8bf219bb9419e0",
          "destination": "annotated_types-0.8.0-py3-none-any.whl",
          "filename": "annotated_types-0.8.0-py3-none-any.whl"
        },
        {
          "sha256": "6152fdbbf9a77fdec97731721bebf7c4c44f7c29b424b0065826173efc7ed101",
          "destination": "anyio-4.15.1-py3-none-any.whl",
          "filename": "anyio-4.15.1-py3-none-any.whl"
        },
        {
          "sha256": "b30d1df6c5d3de5dcef0fb0e256f6ea17bdcf5f979408df0297d8a408e2971b4",
          "destination": "audioread-3.1.0-py3-none-any.whl",
          "filename": "audioread-3.1.0-py3-none-any.whl"
        },
        {
          "sha256": "ea1480b7a8d5405cb5f382b344731bf125fd2c1c6fae3964f6c48595628387ff",
          "destination": "av-18.1.0-cp311-abi3-win_amd64.whl",
          "filename": "av-18.1.0-cp311-abi3-win_amd64.whl"
        },
        {
          "sha256": "ba0efaa9080b619ff2f3459d1d500c57bddea4a6b424b60a91141db6fd2f08bc",
          "destination": "blinker-1.9.0-py3-none-any.whl",
          "filename": "blinker-1.9.0-py3-none-any.whl"
        },
        {
          "sha256": "022426c9e99fd65d9475dce5c195526f04bb8be8907607e27e747893f6ee3e24",
          "destination": "brotli-1.2.0-cp311-cp311-win_amd64.whl",
          "filename": "brotli-1.2.0-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "62f22742b58a1a33014a2b6b706588a8d7e2a88ae7bd1a6ebe8c992928483775",
          "destination": "certifi-2026.7.22-py3-none-any.whl",
          "filename": "certifi-2026.7.22-py3-none-any.whl"
        },
        {
          "sha256": "42f6930c31dc7f50732c9ae793c2786c7b6b044195967bbdde40bb9be81c4cc0",
          "destination": "cffi-2.1.1-cp311-cp311-win_amd64.whl",
          "filename": "cffi-2.1.1-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "87e50a3e7cb90af586b6c5faf23e302a970415ac73bd7bd90a515a04b427ef96",
          "destination": "charset_normalizer-3.5.2-cp311-cp311-win_amd64.whl",
          "filename": "charset_normalizer-3.5.2-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "255bc9599cf7748b4b1a446ccc735421bd08a2ae529a8b88597d3de5664ee360",
          "destination": "click-8.5.0-py3-none-any.whl",
          "filename": "click-8.5.0-py3-none-any.whl"
        },
        {
          "sha256": "9acb47f6afd73f60dc1df93bb801b472f05ff42fa6c84167d25cb206be1fbf4a",
          "destination": "cloudpickle-3.1.2-py3-none-any.whl",
          "filename": "cloudpickle-3.1.2-py3-none-any.whl"
        },
        {
          "sha256": "4f1d9991f5acc0ca119f9d443620b77f9d6b33703e51011c16baf57afb285fc6",
          "destination": "colorama-0.4.6-py2.py3-none-any.whl",
          "filename": "colorama-0.4.6-py2.py3-none-any.whl"
        },
        {
          "sha256": "8566ea804cfc265f5e9dda71d1b716aa24ee4c3423a5da4b28a248a78c33e3f9",
          "destination": "cython-3.3.0-cp311-cp311-win_amd64.whl",
          "filename": "cython-3.3.0-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "f47fe6fdbd2edd623ecfe36875d37aba411624e2670dd395dddae1358689bb3c",
          "destination": "decorator-5.3.1-py3-none-any.whl",
          "filename": "decorator-5.3.1-py3-none-any.whl"
        },
        {
          "sha256": "3d5a88d2ea7b518b422d57b3fbc123cd7f42e78c80357736f6f7b8f179fac6d9",
          "destination": "dynet38-2.2-cp311-cp311-win_amd64.whl",
          "filename": "dynet38-2.2-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "bd5f4d81f1e93a88bcd77caf4dfe3c2dbffc3805407a0007e9a114c18b3a670b",
          "destination": "fastapi-0.142.2-py3-none-any.whl",
          "filename": "fastapi-0.142.2-py3-none-any.whl"
        },
        {
          "sha256": "7f0ca4bcc0e181c60dbbd8aa9ab5b120ebb99e4e064e83636340056f833a1f09",
          "destination": "filelock-3.32.3-py3-none-any.whl",
          "filename": "filelock-3.32.3-py3-none-any.whl"
        },
        {
          "sha256": "5f17ee83ecee8a6f3e389c75822fb70a1c2f0506b99438a6dffa1d56793588c8",
          "destination": "filelock-4.0.12-py3-none-any.whl",
          "filename": "filelock-4.0.12-py3-none-any.whl"
        },
        {
          "sha256": "f4bcbefc124291925f1a26446da31a5178f9483862233b23c0c96a20701f670c",
          "destination": "flask-3.1.3-py3-none-any.whl",
          "filename": "flask-3.1.3-py3-none-any.whl"
        },
        {
          "sha256": "b57ddbafedfaef7018c1ecab32aa200a9d7ca26b77965f64e48b70061249d279",
          "destination": "fsspec-2026.7.0-py3-none-any.whl",
          "filename": "fsspec-2026.7.0-py3-none-any.whl"
        },
        {
          "sha256": "8dd6e646e99ea382bd85f97a45e6b526a442d79423a7dc673f1e2756d05fcb5f",
          "destination": "fsspec-2026.9.0-py3-none-any.whl",
          "filename": "fsspec-2026.9.0-py3-none-any.whl"
        },
        {
          "sha256": "7e52c65bfbb7bd75ac1c28cb38f93b01e5f6a2ff013224e6213533451bfee517",
          "destination": "gradio-6.17.3-py3-none-any.whl",
          "filename": "gradio-6.17.3-py3-none-any.whl"
        },
        {
          "sha256": "d43e2179c29076292a76485ad7ed2e6eaa19d14ac58283bd7f5beabfe4ca958c",
          "destination": "gradio_client-2.5.0-py3-none-any.whl",
          "filename": "gradio_client-2.5.0-py3-none-any.whl"
        },
        {
          "sha256": "7f7975bab18c729a257a8b1ae9dcd70b7cafb1720481beae47719af57c35fa64",
          "destination": "groovy-0.1.2-py3-none-any.whl",
          "filename": "groovy-0.1.2-py3-none-any.whl"
        },
        {
          "sha256": "63cf8bbe7522de3bf65932fda1d9c2772064ffb3dae62d55932da54b31cb6c86",
          "destination": "h11-0.16.0-py3-none-any.whl",
          "filename": "h11-0.16.0-py3-none-any.whl"
        },
        {
          "sha256": "76b8cb8be6abe62d74c1ad2d35b42f0629db89aa9e1a8d033cecfe7c856eeab3",
          "destination": "hf_gradio-0.4.1-py3-none-any.whl",
          "filename": "hf_gradio-0.4.1-py3-none-any.whl"
        },
        {
          "sha256": "2d400746a40668fc9dec9810239072b40b4484b640a8c38fd654a024c7a1bf55",
          "destination": "httpcore-1.0.9-py3-none-any.whl",
          "filename": "httpcore-1.0.9-py3-none-any.whl"
        },
        {
          "sha256": "d909fcccc110f8c7faf814ca82a9a4d816bc5a6dbfea25d6591d6985b8ba59ad",
          "destination": "httpx-0.28.1-py3-none-any.whl",
          "filename": "httpx-0.28.1-py3-none-any.whl"
        },
        {
          "sha256": "48f0c8eac16145dfce371e9d2d7772854a4f591bcb56c9cf548accf531d54270",
          "destination": "huggingface_hub-0.36.2-py3-none-any.whl",
          "filename": "huggingface_hub-0.36.2-py3-none-any.whl"
        },
        {
          "sha256": "ab7ae7122974553370f0bdb919e1a960b2cd1bc1ef0276416d896db81c14582c",
          "destination": "idna-3.20-py3-none-any.whl",
          "filename": "idna-3.20-py3-none-any.whl"
        },
        {
          "sha256": "c6242fc49e35958c8b15141343aa660db5fc54d4f13a1db01a3f5891b98700ef",
          "destination": "itsdangerous-2.2.0-py3-none-any.whl",
          "filename": "itsdangerous-2.2.0-py3-none-any.whl"
        },
        {
          "sha256": "85ece4451f492d0c13c5dd7c13a64681a86afae63a5f347908daf103ce6d2f67",
          "destination": "jinja2-3.1.6-py3-none-any.whl",
          "filename": "jinja2-3.1.6-py3-none-any.whl"
        },
        {
          "sha256": "3dbbf9f6e4b592a2357b854608e980fe6390d131d7a82f011a377ef2ebef7aba",
          "destination": "joblib-1.6.0-py3-none-any.whl",
          "filename": "joblib-1.6.0-py3-none-any.whl"
        },
        {
          "sha256": "77253be3391b06124a0e16105bd663b6c54470af1a9ca8e1cf026f38d58ed056",
          "destination": "lazy_loader-0.6-py3-none-any.whl",
          "filename": "lazy_loader-0.6-py3-none-any.whl"
        },
        {
          "sha256": "0b6415c4fd68bff4c29288abe67c6d80b587e0e1e2cfb0aad23e4559504a7fa1",
          "destination": "librosa-0.11.0-py3-none-any.whl",
          "filename": "librosa-0.11.0-py3-none-any.whl"
        },
        {
          "sha256": "ffe46ef508df226e54b5fe1f7bf11122e5297bcdbb3902cc5b670a429d56ff47",
          "destination": "llvmlite-0.50.0-cp311-cp311-win_amd64.whl",
          "filename": "llvmlite-0.50.0-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "9f7ebbcd14fe59494226453aed97c1070d83f8d24b6fc3a3bcf9a38092641c4a",
          "destination": "markdown_it_py-4.2.0-py3-none-any.whl",
          "filename": "markdown_it_py-4.2.0-py3-none-any.whl"
        },
        {
          "sha256": "de8a88e63464af587c950061a5e6a67d3632e36df62b986892331d4620a35c01",
          "destination": "markupsafe-3.0.3-cp311-cp311-win_amd64.whl",
          "filename": "markupsafe-3.0.3-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "fdb4ca07ab75ffadab4a8b135ad59cdbb3156b99310f3d565370da74a15d6bd3",
          "destination": "markupsafe-3.0.4-cp311-cp311-win_amd64.whl",
          "filename": "markupsafe-3.0.4-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "84008a41e51615a49fc9966191ff91509e3c40b939176e643fd50a5c2196b8f8",
          "destination": "mdurl-0.1.2-py3-none-any.whl",
          "filename": "mdurl-0.1.2-py3-none-any.whl"
        },
        {
          "sha256": "a0b2b9fe80bbcd81a6647ff13108738cfb482d481d826cc0e02f5b35e5c88d2c",
          "destination": "mpmath-1.3.0-py3-none-any.whl",
          "filename": "mpmath-1.3.0-py3-none-any.whl"
        },
        {
          "sha256": "30e1522e4173230dca4d9ad896f038f73c0da6c1edd42f4dbad88ac583cf5d46",
          "destination": "msgpack-1.2.3-cp311-cp311-win_amd64.whl",
          "filename": "msgpack-1.2.3-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "551f8060e0208bbc80ab8766f923568b2cdbe49d47012cc0d29a310de0bd3a32",
          "destination": "nagisa-0.2.11-cp311-cp311-win_amd64.whl",
          "filename": "nagisa-0.2.11-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "29326d74f107c347fd1009bd58e38d9f7c7c5b51e6de97bc93dbc325d9038b54",
          "destination": "narwhals-2.26.0-py3-none-any.whl",
          "filename": "narwhals-2.26.0-py3-none-any.whl"
        },
        {
          "sha256": "d47fbf302e7d9cbbb9e2555a0d267983d2aa476bac30e90dfbe5669bd57f3762",
          "destination": "networkx-3.6.1-py3-none-any.whl",
          "filename": "networkx-3.6.1-py3-none-any.whl"
        },
        {
          "sha256": "d36f7c6a07c27fa175f5a4683083c6a830f7791fbda592a8676ce47a444965f7",
          "destination": "numba-0.68.0-cp311-cp311-win_amd64.whl",
          "filename": "numba-0.68.0-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "e8213002e427c69c45a52bbd94163084025f533a55a59d6f9c5b820774ef3303",
          "destination": "numpy-2.2.6-cp311-cp311-win_amd64.whl",
          "filename": "numpy-2.2.6-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "80e068aba7cd56c8b58512d6a36f8d25cb1dfaa0c0a4cc1c938ccf9f362d9cb3",
          "destination": "opentelemetry_api-1.45.0-py3-none-any.whl",
          "filename": "opentelemetry_api-1.45.0-py3-none-any.whl"
        },
        {
          "sha256": "fb2539159dfe8d371914f354360fa50e4a577cc89222a3828b9650a5e5040252",
          "destination": "orjson-3.12.0-cp311-cp311-win_amd64.whl",
          "filename": "orjson-3.12.0-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "d7193f7c8e4e93f444fde0262bf90af30e16fa0ad0ad44cb553c87339b23cd1c",
          "destination": "packaging-26.3-py3-none-any.whl",
          "filename": "packaging-26.3-py3-none-any.whl"
        },
        {
          "sha256": "2e5fa32ff162dfdbc280157d664f44d23049ae414725af9676df339c501d82cd",
          "destination": "pandas-3.0.6-cp311-cp311-win_amd64.whl",
          "filename": "pandas-3.0.6-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "8e95e1385e4998ae9694eeaa4730ba5457ff61185b3a55e2e7bea0880aef452a",
          "destination": "pillow-12.3.0-cp311-cp311-win_amd64.whl",
          "filename": "pillow-12.3.0-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "6d67a2b4e7f14d8b31b8b52648866fa717f45a1eb70e83002f4331d07e953717",
          "destination": "pip-25.2-py3-none-any.whl",
          "filename": "pip-25.2-py3-none-any.whl"
        },
        {
          "sha256": "080f3b39423b5abfca9a23d84c4e9795f54d395cd8459867a8ded44084fcd5f8",
          "destination": "platformdirs-4.12.3-py3-none-any.whl",
          "filename": "platformdirs-4.12.3-py3-none-any.whl"
        },
        {
          "sha256": "f265597baa9f760d25ceb29d0beb8186c243d6607b0f60b83ecf14078dbc703b",
          "destination": "pooch-1.9.0-py3-none-any.whl",
          "filename": "pooch-1.9.0-py3-none-any.whl"
        },
        {
          "sha256": "eb7e81434c8d223ec4a219b5fc1c47d0417b12be7ea866e24fb5ad6e84b3d988",
          "destination": "psutil-7.2.2-cp37-abi3-win_amd64.whl",
          "filename": "psutil-7.2.2-cp37-abi3-win_amd64.whl"
        },
        {
          "sha256": "b727414169a36b7d524c1c3e31839a521725078d7b2ff038656844266160a992",
          "destination": "pycparser-3.0-py3-none-any.whl",
          "filename": "pycparser-3.0-py3-none-any.whl"
        },
        {
          "sha256": "346a034f080da3755d8e9cb5e00e8b07de1d39e4f6e2c87d8ab7cafa0b269a73",
          "destination": "pydantic-2.13.5-py3-none-any.whl",
          "filename": "pydantic-2.13.5-py3-none-any.whl"
        },
        {
          "sha256": "40375c2d05acec10323e45dfe2077ac44bc74659008614af5069034e2cfc781c",
          "destination": "pydantic_core-2.46.5-cp311-cp311-win_amd64.whl",
          "filename": "pydantic_core-2.46.5-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "65617e33033874b59d87db603aa1ed450633288aefead953b30bded59cb599a6",
          "destination": "pydub-0.25.1-py2.py3-none-any.whl",
          "filename": "pydub-0.25.1-py2.py3-none-any.whl"
        },
        {
          "sha256": "2363c69b61c4a97c838da3b130dcd6468f4848992b21a82f2a63ec34377137d9",
          "destination": "pygments-2.21.0-py3-none-any.whl",
          "filename": "pygments-2.21.0-py3-none-any.whl"
        },
        {
          "sha256": "a8b2bc7bffae282281c8140a97d3aa9c14da0b136dfe83f850eea9a5f7470427",
          "destination": "python_dateutil-2.9.0.post0-py2.py3-none-any.whl",
          "filename": "python_dateutil-2.9.0.post0-py2.py3-none-any.whl"
        },
        {
          "sha256": "ff6d3f776f16878c894e52e107296ffc890e913c611b1a4ec6c44e2821fe2e23",
          "destination": "python_multipart-0.0.32-py3-none-any.whl",
          "filename": "python_multipart-0.0.32-py3-none-any.whl"
        },
        {
          "sha256": "e658af3757f9e26a9d25dd2aff38335acd92bc9104f890a894b2c1ba28311b03",
          "destination": "pytz-2026.5-py2.py3-none-any.whl",
          "filename": "pytz-2026.5-py2.py3-none-any.whl"
        },
        {
          "sha256": "9f3bfb4965eb874431221a3ff3fdcddc7e74e3b07799e0e84ca4a0f867d449bf",
          "destination": "pyyaml-6.0.3-cp311-cp311-win_amd64.whl",
          "filename": "pyyaml-6.0.3-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "b9c55a38413298f3a990a4475467399daec6e8f4172363053fc42e2166c2dfd3",
          "destination": "qwen_asr-0.0.6-py3-none-any.whl",
          "filename": "qwen_asr-0.0.6-py3-none-any.whl"
        },
        {
          "sha256": "f111db07af669c83333411c5177131e18e831fe666d6a55a1af263952ada8939",
          "destination": "qwen_omni_utils-0.0.9-py3-none-any.whl",
          "filename": "qwen_omni_utils-0.0.9-py3-none-any.whl"
        },
        {
          "sha256": "1043aedf5917caa861bcb25a9c11460049656bdf0017a90a309fa8f255467725",
          "destination": "regex-2026.9.29-cp311-cp311-win_amd64.whl",
          "filename": "regex-2026.9.29-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "2a0d60c172f83ac6ab31e4554906c0f3b3588d37b5cb939b1c061f4907e278e0",
          "destination": "requests-2.34.2-py3-none-any.whl",
          "filename": "requests-2.34.2-py3-none-any.whl"
        },
        {
          "sha256": "33bd4ef74232fb73fe9279a257718407f169c09b78a87ad3d296f548e27de0bb",
          "destination": "rich-15.0.0-py3-none-any.whl",
          "filename": "rich-15.0.0-py3-none-any.whl"
        },
        {
          "sha256": "c4f4a162db6993464d7ca3d7cc4af0ffc6515a606dfd220b9f82c6945d869cde",
          "destination": "safehttpx-0.1.7-py3-none-any.whl",
          "filename": "safehttpx-0.1.7-py3-none-any.whl"
        },
        {
          "sha256": "096ec1a98435df7beb08853bb5aa9081a84f23d0adc67ed1a0a10550f608373f",
          "destination": "safetensors-0.8.0-cp310-abi3-win_amd64.whl",
          "filename": "safetensors-0.8.0-cp310-abi3-win_amd64.whl"
        },
        {
          "sha256": "220fa18152852a5ce29c49e1eaba9d44ec44631cd2e5cf65f5a40eafa5ab3412",
          "destination": "scikit_learn-1.9.1-cp311-cp311-win_amd64.whl",
          "filename": "scikit_learn-1.9.1-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "d30e57c72013c2a4fe441c2fcb8e77b14e152ad48b5464858e07e2ad9fbfceff",
          "destination": "scipy-1.17.1-cp311-cp311-win_amd64.whl",
          "filename": "scipy-1.17.1-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "de78a3b8e0feda74cabc54aab2da702113e33ac9d9eb9d2389bcf1f58b7d9177",
          "destination": "semantic_version-2.10.0-py2.py3-none-any.whl",
          "filename": "semantic_version-2.10.0-py2.py3-none-any.whl"
        },
        {
          "sha256": "7ecfff8f2fd72616f7481040475a65b2bf8af90a56c89140852d1120324e8686",
          "destination": "shellingham-1.5.4-py2.py3-none-any.whl",
          "filename": "shellingham-1.5.4-py2.py3-none-any.whl"
        },
        {
          "sha256": "171e6fac715bae20e11829e8dbfc70ed990ede1b35e6332f8121b27691a002de",
          "destination": "sherpa_onnx-1.13.8-cp311-cp311-win_amd64.whl",
          "filename": "sherpa_onnx-1.13.8-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "5579e80196d516e6dae23c8f629292ce3142ab8869925d32b94612fd86f93733",
          "destination": "sherpa_onnx_core-1.13.8-py3-none-win_amd64.whl",
          "filename": "sherpa_onnx_core-1.13.8-py3-none-win_amd64.whl"
        },
        {
          "sha256": "4721f391ed90541fddacab5acf947aa0d3dc7d27b2e1e8eda2be8970586c3274",
          "destination": "six-1.17.0-py2.py3-none-any.whl",
          "filename": "six-1.17.0-py2.py3-none-any.whl"
        },
        {
          "sha256": "299491d3499460fb1b74bb4bd78b57ffc2d243a5fafa7b6ec1b264875c78453e",
          "destination": "soundfile-0.14.0-py2.py3-none-win_amd64.whl",
          "filename": "soundfile-0.14.0-py2.py3-none-win_amd64.whl"
        },
        {
          "sha256": "54a4a89ab8b6153cbf61ed6297ac836face23d8664a6efefc557a22ed448bc6f",
          "destination": "sox-1.5.0-py3-none-any.whl",
          "filename": "sox-1.5.0-py3-none-any.whl"
        },
        {
          "sha256": "ae30c48ac795378cf23ba3c7c640b8ff794af714ac388b9fd6b31a40b39e6e86",
          "destination": "soxr-1.1.0-cp311-cp311-win_amd64.whl",
          "filename": "soxr-1.1.0-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "2aed0ced1f0f74f7bdd0bdc24a979c5cb9ee4a28393642db52a83d174ed65b7a",
          "destination": "soynlp-0.0.493-py3-none-any.whl",
          "filename": "soynlp-0.0.493-py3-none-any.whl"
        },
        {
          "sha256": "67f8e99895493dd2911a03f11314af6ceebeae4e704bb9f43dfc6a9db151c93e",
          "destination": "starlette-1.7.0-py3-none-any.whl",
          "filename": "starlette-1.7.0-py3-none-any.whl"
        },
        {
          "sha256": "e091cc3e99d2141a0ba2847328f5479b05d94a6635cb96148ccb3f34671bd8f5",
          "destination": "sympy-1.14.0-py3-none-any.whl",
          "filename": "sympy-1.14.0-py3-none-any.whl"
        },
        {
          "sha256": "cd8b60b5641b45c67bbf73c64c843235fc2d8a480c87389f52f5dbee893b86be",
          "destination": "threadpoolctl-3.7.0-py3-none-any.whl",
          "filename": "threadpoolctl-3.7.0-py3-none-any.whl"
        },
        {
          "sha256": "c9ea31edff2968b44a88f97d784c2f16dc0729b8b143ed004699ebca91f05c48",
          "destination": "tokenizers-0.22.2-cp39-abi3-win_amd64.whl",
          "filename": "tokenizers-0.22.2-cp39-abi3-win_amd64.whl"
        },
        {
          "sha256": "592064ed85b40fa213469f81ac584f67a4f2992509a7c3ea2d632208623a3680",
          "destination": "tomlkit-0.14.0-py3-none-any.whl",
          "filename": "tomlkit-0.14.0-py3-none-any.whl"
        },
        {
          "sha256": "34c55443aafd31046a7963b63d30bc3b628ee4a704f826796c865fdfd05bb596",
          "destination": "torch-2.8.0+cu128-cp311-cp311-win_amd64.whl",
          "filename": "torch-2.8.0+cu128-cp311-cp311-win_amd64.whl"
        },
        {
          "sha256": "c293e525e6fef9c20e8728fd4612df02a0aa31bb5fe91ecd93e123b1b7bffa73",
          "destination": "tqdm-4.70.1-py3-none-any.whl",
          "filename": "tqdm-4.70.1-py3-none-any.whl"
        },
        {
          "sha256": "4c9e9de11333ddfe5114bc872c9f370509198acf0b87a832a0ab9458e2bd0550",
          "destination": "transformers-4.57.6-py3-none-any.whl",
          "filename": "transformers-4.57.6-py3-none-any.whl"
        },
        {
          "sha256": "b3a5fc4342d5fc8fda8fc3010b1cf117e9249aab7fae800c2eff62fd3842d97d",
          "destination": "typer-0.27.2-py3-none-any.whl",
          "filename": "typer-0.27.2-py3-none-any.whl"
        },
        {
          "sha256": "481caa481374e813c1b176ada14e97f1f67a4539ce9cfeb3f350d78d6370c2e8",
          "destination": "typing_extensions-4.16.0-py3-none-any.whl",
          "filename": "typing_extensions-4.16.0-py3-none-any.whl"
        },
        {
          "sha256": "65b8397ba37ccbce054456aaccddfc91e6e3083c92824df348d96ca832f3f147",
          "destination": "typing_inspection-0.4.4-py3-none-any.whl",
          "filename": "typing_inspection-0.4.4-py3-none-any.whl"
        },
        {
          "sha256": "b683bd1b6659ddcd810ff02ad09ba821d4bf1065072805063eb35c49617905ac",
          "destination": "tzdata-2026.5-py2.py3-none-any.whl",
          "filename": "tzdata-2026.5-py2.py3-none-any.whl"
        },
        {
          "sha256": "0cf3cae568d36aa9576b28dfb35f11328f1cb974ca7647d9475ebb86c75ac6e3",
          "destination": "urllib3-2.8.0-py3-none-any.whl",
          "filename": "urllib3-2.8.0-py3-none-any.whl"
        },
        {
          "sha256": "505bdb0f318731d45f1f712071fc781a8981f6847a31c902c9f5e652d4f67faf",
          "destination": "uvicorn-0.54.0-py3-none-any.whl",
          "filename": "uvicorn-0.54.0-py3-none-any.whl"
        },
        {
          "sha256": "6392e50c78460ba618e5b21f08a71f59c99ce99cdc6cf6e3dd7e6ccca8754fab",
          "destination": "werkzeug-3.1.9-py3-none-any.whl",
          "filename": "werkzeug-3.1.9-py3-none-any.whl"
        }
      ],
      "packages": [
        "sherpa-onnx==1.13.8",
        "numpy==2.2.6",
        "torch==2.8.0+cu128",
        "qwen-asr==0.0.6",
        "huggingface-hub>=0.30"
      ],
      "dependenciesVerified": true,
      "enabled": true,
      "platformVerified": true
    },
    {
      "id": "darwin-arm64-onnx-cpu",
      "version": "1",
      "platform": "darwin",
      "arch": "arm64",
      "engine": "onnx",
      "accelerator": "cpu",
      "python": {
        "sha256": "3663b71c18364eccfbad74c4f21f9f6149e40b07329cd776287410cc1da5d612",
        "format": "tar.gz",
        "destination": "cpython-3.11.17+20261003-aarch64-apple-darwin-install_only.tar.gz",
        "executable": "python/bin/python3.11",
        "filename": "cpython-3.11.17+20261003-aarch64-apple-darwin-install_only.tar.gz"
      },
      "wheels": [
        {
          "sha256": "c820a93b0255bc360f53eca31a0e676fd1101f673dda8da93454a12e23fc5f7a",
          "destination": "numpy-2.2.6-cp311-cp311-macosx_11_0_arm64.whl",
          "filename": "numpy-2.2.6-cp311-cp311-macosx_11_0_arm64.whl"
        },
        {
          "sha256": "6d67a2b4e7f14d8b31b8b52648866fa717f45a1eb70e83002f4331d07e953717",
          "destination": "pip-25.2-py3-none-any.whl",
          "filename": "pip-25.2-py3-none-any.whl"
        },
        {
          "sha256": "8bb2b86ce44b5c5bb9949977177ddc36954c51097f81284d5ac48588e821ec07",
          "destination": "sherpa_onnx-1.13.8-cp311-cp311-macosx_11_0_arm64.whl",
          "filename": "sherpa_onnx-1.13.8-cp311-cp311-macosx_11_0_arm64.whl"
        },
        {
          "sha256": "9312bbd46c93e31cecd3abda9cc8e71881d86cc3da3c35c7445ab04025b9fc3e",
          "destination": "sherpa_onnx_core-1.13.8-py3-none-macosx_11_0_arm64.whl",
          "filename": "sherpa_onnx_core-1.13.8-py3-none-macosx_11_0_arm64.whl"
        }
      ],
      "packages": [
        "sherpa-onnx==1.13.8",
        "numpy==2.2.6"
      ],
      "dependenciesVerified": true,
      "enabled": true,
      "platformVerified": true
    },
    {
      "id": "darwin-arm64-transformers-cpu",
      "version": "1",
      "platform": "darwin",
      "arch": "arm64",
      "engine": "transformers",
      "accelerator": "cpu",
      "python": {
        "sha256": "3663b71c18364eccfbad74c4f21f9f6149e40b07329cd776287410cc1da5d612",
        "format": "tar.gz",
        "destination": "cpython-3.11.17+20261003-aarch64-apple-darwin-install_only.tar.gz",
        "executable": "python/bin/python3.11",
        "filename": "cpython-3.11.17+20261003-aarch64-apple-darwin-install_only.tar.gz"
      },
      "wheels": [
        {
          "sha256": "3e2091cd341423207e2f084a6654b1efcd250dc326f2a37d6dde446e07cabb11",
          "destination": "accelerate-1.12.0-py3-none-any.whl",
          "filename": "accelerate-1.12.0-py3-none-any.whl"
        },
        {
          "sha256": "117bac03a25ede5df5440e855b32d556049ca169ead221505badf432fed4b101",
          "destination": "annotated_doc-0.0.5-py3-none-any.whl",
          "filename": "annotated_doc-0.0.5-py3-none-any.whl"
        },
        {
          "sha256": "f072f4d804ea359e4eaf198b1af7a8b0943881a87f31bb764f8bf219bb9419e0",
          "destination": "annotated_types-0.8.0-py3-none-any.whl",
          "filename": "annotated_types-0.8.0-py3-none-any.whl"
        },
        {
          "sha256": "6152fdbbf9a77fdec97731721bebf7c4c44f7c29b424b0065826173efc7ed101",
          "destination": "anyio-4.15.1-py3-none-any.whl",
          "filename": "anyio-4.15.1-py3-none-any.whl"
        },
        {
          "sha256": "b30d1df6c5d3de5dcef0fb0e256f6ea17bdcf5f979408df0297d8a408e2971b4",
          "destination": "audioread-3.1.0-py3-none-any.whl",
          "filename": "audioread-3.1.0-py3-none-any.whl"
        },
        {
          "sha256": "b30a4e8d934558e19602b68998a4d9ac9f250fa0dacef216f7e8e40153b13316",
          "destination": "av-18.1.0-cp311-abi3-macosx_14_0_arm64.whl",
          "filename": "av-18.1.0-cp311-abi3-macosx_14_0_arm64.whl"
        },
        {
          "sha256": "ba0efaa9080b619ff2f3459d1d500c57bddea4a6b424b60a91141db6fd2f08bc",
          "destination": "blinker-1.9.0-py3-none-any.whl",
          "filename": "blinker-1.9.0-py3-none-any.whl"
        },
        {
          "sha256": "15b33fe93cedc4caaff8a0bd1eb7e3dab1c61bb22a0bf5bdfdfd97cd7da79744",
          "destination": "brotli-1.2.0-cp311-cp311-macosx_10_9_universal2.whl",
          "filename": "brotli-1.2.0-cp311-cp311-macosx_10_9_universal2.whl"
        },
        {
          "sha256": "62f22742b58a1a33014a2b6b706588a8d7e2a88ae7bd1a6ebe8c992928483775",
          "destination": "certifi-2026.7.22-py3-none-any.whl",
          "filename": "certifi-2026.7.22-py3-none-any.whl"
        },
        {
          "sha256": "398aff33cee2767e3e781d2554c54bd0dff386bb437581e0d8011fde1a942ec1",
          "destination": "cffi-2.1.1-cp311-cp311-macosx_11_0_arm64.whl",
          "filename": "cffi-2.1.1-cp311-cp311-macosx_11_0_arm64.whl"
        },
        {
          "sha256": "3d21b8b13c7592db2ac5e544a6d83187b995257472b0c9e8351b6d507ae37ed6",
          "destination": "charset_normalizer-3.5.2-cp311-cp311-macosx_10_9_universal2.whl",
          "filename": "charset_normalizer-3.5.2-cp311-cp311-macosx_10_9_universal2.whl"
        },
        {
          "sha256": "255bc9599cf7748b4b1a446ccc735421bd08a2ae529a8b88597d3de5664ee360",
          "destination": "click-8.5.0-py3-none-any.whl",
          "filename": "click-8.5.0-py3-none-any.whl"
        },
        {
          "sha256": "9acb47f6afd73f60dc1df93bb801b472f05ff42fa6c84167d25cb206be1fbf4a",
          "destination": "cloudpickle-3.1.2-py3-none-any.whl",
          "filename": "cloudpickle-3.1.2-py3-none-any.whl"
        },
        {
          "sha256": "4f1d9991f5acc0ca119f9d443620b77f9d6b33703e51011c16baf57afb285fc6",
          "destination": "colorama-0.4.6-py2.py3-none-any.whl",
          "filename": "colorama-0.4.6-py2.py3-none-any.whl"
        },
        {
          "sha256": "ec09dbf73ff4f7be2b339b995fadae9c4bb517bbbed7ec11d6fe99c2092b48fd",
          "destination": "cython-3.3.0-cp311-cp311-macosx_11_0_arm64.whl",
          "filename": "cython-3.3.0-cp311-cp311-macosx_11_0_arm64.whl"
        },
        {
          "sha256": "f47fe6fdbd2edd623ecfe36875d37aba411624e2670dd395dddae1358689bb3c",
          "destination": "decorator-5.3.1-py3-none-any.whl",
          "filename": "decorator-5.3.1-py3-none-any.whl"
        },
        {
          "sha256": "9a6b74b7e3e9e2f4cc253d25e35a46a1f0b8603a22d4c15ca2238e46401e1407",
          "destination": "dyNET38-2.2-cp311-cp311-macosx_11_0_arm64.whl",
          "filename": "dyNET38-2.2-cp311-cp311-macosx_11_0_arm64.whl"
        },
        {
          "sha256": "bd5f4d81f1e93a88bcd77caf4dfe3c2dbffc3805407a0007e9a114c18b3a670b",
          "destination": "fastapi-0.142.2-py3-none-any.whl",
          "filename": "fastapi-0.142.2-py3-none-any.whl"
        },
        {
          "sha256": "5f17ee83ecee8a6f3e389c75822fb70a1c2f0506b99438a6dffa1d56793588c8",
          "destination": "filelock-4.0.12-py3-none-any.whl",
          "filename": "filelock-4.0.12-py3-none-any.whl"
        },
        {
          "sha256": "f4bcbefc124291925f1a26446da31a5178f9483862233b23c0c96a20701f670c",
          "destination": "flask-3.1.3-py3-none-any.whl",
          "filename": "flask-3.1.3-py3-none-any.whl"
        },
        {
          "sha256": "8dd6e646e99ea382bd85f97a45e6b526a442d79423a7dc673f1e2756d05fcb5f",
          "destination": "fsspec-2026.9.0-py3-none-any.whl",
          "filename": "fsspec-2026.9.0-py3-none-any.whl"
        },
        {
          "sha256": "7e52c65bfbb7bd75ac1c28cb38f93b01e5f6a2ff013224e6213533451bfee517",
          "destination": "gradio-6.17.3-py3-none-any.whl",
          "filename": "gradio-6.17.3-py3-none-any.whl"
        },
        {
          "sha256": "d43e2179c29076292a76485ad7ed2e6eaa19d14ac58283bd7f5beabfe4ca958c",
          "destination": "gradio_client-2.5.0-py3-none-any.whl",
          "filename": "gradio_client-2.5.0-py3-none-any.whl"
        },
        {
          "sha256": "7f7975bab18c729a257a8b1ae9dcd70b7cafb1720481beae47719af57c35fa64",
          "destination": "groovy-0.1.2-py3-none-any.whl",
          "filename": "groovy-0.1.2-py3-none-any.whl"
        },
        {
          "sha256": "63cf8bbe7522de3bf65932fda1d9c2772064ffb3dae62d55932da54b31cb6c86",
          "destination": "h11-0.16.0-py3-none-any.whl",
          "filename": "h11-0.16.0-py3-none-any.whl"
        },
        {
          "sha256": "76b8cb8be6abe62d74c1ad2d35b42f0629db89aa9e1a8d033cecfe7c856eeab3",
          "destination": "hf_gradio-0.4.1-py3-none-any.whl",
          "filename": "hf_gradio-0.4.1-py3-none-any.whl"
        },
        {
          "sha256": "f0906082d9932ae0c0057fa194041c22b4e2cdb46b2592ef3b91f020d62a081a",
          "destination": "hf_xet-1.6.0-cp38-abi3-macosx_11_0_arm64.whl",
          "filename": "hf_xet-1.6.0-cp38-abi3-macosx_11_0_arm64.whl"
        },
        {
          "sha256": "2d400746a40668fc9dec9810239072b40b4484b640a8c38fd654a024c7a1bf55",
          "destination": "httpcore-1.0.9-py3-none-any.whl",
          "filename": "httpcore-1.0.9-py3-none-any.whl"
        },
        {
          "sha256": "d909fcccc110f8c7faf814ca82a9a4d816bc5a6dbfea25d6591d6985b8ba59ad",
          "destination": "httpx-0.28.1-py3-none-any.whl",
          "filename": "httpx-0.28.1-py3-none-any.whl"
        },
        {
          "sha256": "48f0c8eac16145dfce371e9d2d7772854a4f591bcb56c9cf548accf531d54270",
          "destination": "huggingface_hub-0.36.2-py3-none-any.whl",
          "filename": "huggingface_hub-0.36.2-py3-none-any.whl"
        },
        {
          "sha256": "ab7ae7122974553370f0bdb919e1a960b2cd1bc1ef0276416d896db81c14582c",
          "destination": "idna-3.20-py3-none-any.whl",
          "filename": "idna-3.20-py3-none-any.whl"
        },
        {
          "sha256": "c6242fc49e35958c8b15141343aa660db5fc54d4f13a1db01a3f5891b98700ef",
          "destination": "itsdangerous-2.2.0-py3-none-any.whl",
          "filename": "itsdangerous-2.2.0-py3-none-any.whl"
        },
        {
          "sha256": "85ece4451f492d0c13c5dd7c13a64681a86afae63a5f347908daf103ce6d2f67",
          "destination": "jinja2-3.1.6-py3-none-any.whl",
          "filename": "jinja2-3.1.6-py3-none-any.whl"
        },
        {
          "sha256": "3dbbf9f6e4b592a2357b854608e980fe6390d131d7a82f011a377ef2ebef7aba",
          "destination": "joblib-1.6.0-py3-none-any.whl",
          "filename": "joblib-1.6.0-py3-none-any.whl"
        },
        {
          "sha256": "77253be3391b06124a0e16105bd663b6c54470af1a9ca8e1cf026f38d58ed056",
          "destination": "lazy_loader-0.6-py3-none-any.whl",
          "filename": "lazy_loader-0.6-py3-none-any.whl"
        },
        {
          "sha256": "0b6415c4fd68bff4c29288abe67c6d80b587e0e1e2cfb0aad23e4559504a7fa1",
          "destination": "librosa-0.11.0-py3-none-any.whl",
          "filename": "librosa-0.11.0-py3-none-any.whl"
        },
        {
          "sha256": "818b3d4845ac8e126e23cb500867570d0602a42a43e67b14acec31f046e03130",
          "destination": "llvmlite-0.50.0-cp311-cp311-macosx_12_0_arm64.whl",
          "filename": "llvmlite-0.50.0-cp311-cp311-macosx_12_0_arm64.whl"
        },
        {
          "sha256": "9f7ebbcd14fe59494226453aed97c1070d83f8d24b6fc3a3bcf9a38092641c4a",
          "destination": "markdown_it_py-4.2.0-py3-none-any.whl",
          "filename": "markdown_it_py-4.2.0-py3-none-any.whl"
        },
        {
          "sha256": "7d3391b2188d18737cb2fa147028b1096236eaa7e156446c650a489fa2cadc91",
          "destination": "markupsafe-3.0.4-cp311-cp311-macosx_11_0_arm64.whl",
          "filename": "markupsafe-3.0.4-cp311-cp311-macosx_11_0_arm64.whl"
        },
        {
          "sha256": "84008a41e51615a49fc9966191ff91509e3c40b939176e643fd50a5c2196b8f8",
          "destination": "mdurl-0.1.2-py3-none-any.whl",
          "filename": "mdurl-0.1.2-py3-none-any.whl"
        },
        {
          "sha256": "a0b2b9fe80bbcd81a6647ff13108738cfb482d481d826cc0e02f5b35e5c88d2c",
          "destination": "mpmath-1.3.0-py3-none-any.whl",
          "filename": "mpmath-1.3.0-py3-none-any.whl"
        },
        {
          "sha256": "9d7e9cbb0998bbfd363fd9a09c330520d5e9cb323c05b5a1a05865d23ccf2226",
          "destination": "msgpack-1.2.3-cp311-cp311-macosx_11_0_arm64.whl",
          "filename": "msgpack-1.2.3-cp311-cp311-macosx_11_0_arm64.whl"
        },
        {
          "sha256": "14ad851d6281671fdfcafd41ff276c3a46610c2f0ec53988561de3ab10037e62",
          "destination": "nagisa-0.2.11-cp311-cp311-macosx_11_0_arm64.whl",
          "filename": "nagisa-0.2.11-cp311-cp311-macosx_11_0_arm64.whl"
        },
        {
          "sha256": "29326d74f107c347fd1009bd58e38d9f7c7c5b51e6de97bc93dbc325d9038b54",
          "destination": "narwhals-2.26.0-py3-none-any.whl",
          "filename": "narwhals-2.26.0-py3-none-any.whl"
        },
        {
          "sha256": "d47fbf302e7d9cbbb9e2555a0d267983d2aa476bac30e90dfbe5669bd57f3762",
          "destination": "networkx-3.6.1-py3-none-any.whl",
          "filename": "networkx-3.6.1-py3-none-any.whl"
        },
        {
          "sha256": "50399af9d3799a4677044294861169c614bd7e1d8bbfc9479f78a67ab28ff427",
          "destination": "numba-0.68.0-cp311-cp311-macosx_12_0_arm64.whl",
          "filename": "numba-0.68.0-cp311-cp311-macosx_12_0_arm64.whl"
        },
        {
          "sha256": "c820a93b0255bc360f53eca31a0e676fd1101f673dda8da93454a12e23fc5f7a",
          "destination": "numpy-2.2.6-cp311-cp311-macosx_11_0_arm64.whl",
          "filename": "numpy-2.2.6-cp311-cp311-macosx_11_0_arm64.whl"
        },
        {
          "sha256": "80e068aba7cd56c8b58512d6a36f8d25cb1dfaa0c0a4cc1c938ccf9f362d9cb3",
          "destination": "opentelemetry_api-1.45.0-py3-none-any.whl",
          "filename": "opentelemetry_api-1.45.0-py3-none-any.whl"
        },
        {
          "sha256": "a94f0f0c6fcbb2b5bd9734c57a489c7584a732bbdf04a39e8c83b861e9d03e92",
          "destination": "orjson-3.12.0-cp311-cp311-macosx_10_15_x86_64.macosx_11_0_arm64.macosx_10_15_universal2.whl",
          "filename": "orjson-3.12.0-cp311-cp311-macosx_10_15_x86_64.macosx_11_0_arm64.macosx_10_15_universal2.whl"
        },
        {
          "sha256": "d7193f7c8e4e93f444fde0262bf90af30e16fa0ad0ad44cb553c87339b23cd1c",
          "destination": "packaging-26.3-py3-none-any.whl",
          "filename": "packaging-26.3-py3-none-any.whl"
        },
        {
          "sha256": "d7564d86a94c2eb8ab290b07f63ddaae5c032fa53897c29a2ff2197d43aee8af",
          "destination": "pandas-3.0.6-cp311-cp311-macosx_11_0_arm64.whl",
          "filename": "pandas-3.0.6-cp311-cp311-macosx_11_0_arm64.whl"
        },
        {
          "sha256": "37d6d0a00072fd2948eb22bce7e1475f34569d90c87c59f7a2ec59541b77f7a6",
          "destination": "pillow-12.3.0-cp311-cp311-macosx_11_0_arm64.whl",
          "filename": "pillow-12.3.0-cp311-cp311-macosx_11_0_arm64.whl"
        },
        {
          "sha256": "6d67a2b4e7f14d8b31b8b52648866fa717f45a1eb70e83002f4331d07e953717",
          "destination": "pip-25.2-py3-none-any.whl",
          "filename": "pip-25.2-py3-none-any.whl"
        },
        {
          "sha256": "080f3b39423b5abfca9a23d84c4e9795f54d395cd8459867a8ded44084fcd5f8",
          "destination": "platformdirs-4.12.3-py3-none-any.whl",
          "filename": "platformdirs-4.12.3-py3-none-any.whl"
        },
        {
          "sha256": "f265597baa9f760d25ceb29d0beb8186c243d6607b0f60b83ecf14078dbc703b",
          "destination": "pooch-1.9.0-py3-none-any.whl",
          "filename": "pooch-1.9.0-py3-none-any.whl"
        },
        {
          "sha256": "1a7b04c10f32cc88ab39cbf606e117fd74721c831c98a27dc04578deb0c16979",
          "destination": "psutil-7.2.2-cp36-abi3-macosx_11_0_arm64.whl",
          "filename": "psutil-7.2.2-cp36-abi3-macosx_11_0_arm64.whl"
        },
        {
          "sha256": "b727414169a36b7d524c1c3e31839a521725078d7b2ff038656844266160a992",
          "destination": "pycparser-3.0-py3-none-any.whl",
          "filename": "pycparser-3.0-py3-none-any.whl"
        },
        {
          "sha256": "346a034f080da3755d8e9cb5e00e8b07de1d39e4f6e2c87d8ab7cafa0b269a73",
          "destination": "pydantic-2.13.5-py3-none-any.whl",
          "filename": "pydantic-2.13.5-py3-none-any.whl"
        },
        {
          "sha256": "d625a186a65201c23a9e3b8ed9c47e90a026e03256608cc91851c6709096844f",
          "destination": "pydantic_core-2.46.5-cp311-cp311-macosx_11_0_arm64.whl",
          "filename": "pydantic_core-2.46.5-cp311-cp311-macosx_11_0_arm64.whl"
        },
        {
          "sha256": "65617e33033874b59d87db603aa1ed450633288aefead953b30bded59cb599a6",
          "destination": "pydub-0.25.1-py2.py3-none-any.whl",
          "filename": "pydub-0.25.1-py2.py3-none-any.whl"
        },
        {
          "sha256": "2363c69b61c4a97c838da3b130dcd6468f4848992b21a82f2a63ec34377137d9",
          "destination": "pygments-2.21.0-py3-none-any.whl",
          "filename": "pygments-2.21.0-py3-none-any.whl"
        },
        {
          "sha256": "a8b2bc7bffae282281c8140a97d3aa9c14da0b136dfe83f850eea9a5f7470427",
          "destination": "python_dateutil-2.9.0.post0-py2.py3-none-any.whl",
          "filename": "python_dateutil-2.9.0.post0-py2.py3-none-any.whl"
        },
        {
          "sha256": "ff6d3f776f16878c894e52e107296ffc890e913c611b1a4ec6c44e2821fe2e23",
          "destination": "python_multipart-0.0.32-py3-none-any.whl",
          "filename": "python_multipart-0.0.32-py3-none-any.whl"
        },
        {
          "sha256": "e658af3757f9e26a9d25dd2aff38335acd92bc9104f890a894b2c1ba28311b03",
          "destination": "pytz-2026.5-py2.py3-none-any.whl",
          "filename": "pytz-2026.5-py2.py3-none-any.whl"
        },
        {
          "sha256": "652cb6edd41e718550aad172851962662ff2681490a8a711af6a4d288dd96824",
          "destination": "pyyaml-6.0.3-cp311-cp311-macosx_11_0_arm64.whl",
          "filename": "pyyaml-6.0.3-cp311-cp311-macosx_11_0_arm64.whl"
        },
        {
          "sha256": "b9c55a38413298f3a990a4475467399daec6e8f4172363053fc42e2166c2dfd3",
          "destination": "qwen_asr-0.0.6-py3-none-any.whl",
          "filename": "qwen_asr-0.0.6-py3-none-any.whl"
        },
        {
          "sha256": "f111db07af669c83333411c5177131e18e831fe666d6a55a1af263952ada8939",
          "destination": "qwen_omni_utils-0.0.9-py3-none-any.whl",
          "filename": "qwen_omni_utils-0.0.9-py3-none-any.whl"
        },
        {
          "sha256": "066d0e3dbfdd739bce2bf8c2a41dd16f73e3d8adc2eb06dd803a36a307f56075",
          "destination": "regex-2026.9.29-cp311-cp311-macosx_11_0_arm64.whl",
          "filename": "regex-2026.9.29-cp311-cp311-macosx_11_0_arm64.whl"
        },
        {
          "sha256": "2a0d60c172f83ac6ab31e4554906c0f3b3588d37b5cb939b1c061f4907e278e0",
          "destination": "requests-2.34.2-py3-none-any.whl",
          "filename": "requests-2.34.2-py3-none-any.whl"
        },
        {
          "sha256": "33bd4ef74232fb73fe9279a257718407f169c09b78a87ad3d296f548e27de0bb",
          "destination": "rich-15.0.0-py3-none-any.whl",
          "filename": "rich-15.0.0-py3-none-any.whl"
        },
        {
          "sha256": "c4f4a162db6993464d7ca3d7cc4af0ffc6515a606dfd220b9f82c6945d869cde",
          "destination": "safehttpx-0.1.7-py3-none-any.whl",
          "filename": "safehttpx-0.1.7-py3-none-any.whl"
        },
        {
          "sha256": "c80201d22cbf405b80647a60ada77bba06c8fba2da2743ba1e89cdcc39a81f25",
          "destination": "safetensors-0.8.0-cp310-abi3-macosx_11_0_arm64.whl",
          "filename": "safetensors-0.8.0-cp310-abi3-macosx_11_0_arm64.whl"
        },
        {
          "sha256": "b48b2b5b41d9c5fbafef5f37b042f61110df3318ad2a45baf57287ea5b9ba5a2",
          "destination": "scikit_learn-1.9.1-cp311-cp311-macosx_12_0_arm64.whl",
          "filename": "scikit_learn-1.9.1-cp311-cp311-macosx_12_0_arm64.whl"
        },
        {
          "sha256": "e18f12c6b0bc5a592ed23d3f7b891f68fd7f8241d69b7883769eb5d5dfb52696",
          "destination": "scipy-1.17.1-cp311-cp311-macosx_12_0_arm64.whl",
          "filename": "scipy-1.17.1-cp311-cp311-macosx_12_0_arm64.whl"
        },
        {
          "sha256": "de78a3b8e0feda74cabc54aab2da702113e33ac9d9eb9d2389bcf1f58b7d9177",
          "destination": "semantic_version-2.10.0-py2.py3-none-any.whl",
          "filename": "semantic_version-2.10.0-py2.py3-none-any.whl"
        },
        {
          "sha256": "7ecfff8f2fd72616f7481040475a65b2bf8af90a56c89140852d1120324e8686",
          "destination": "shellingham-1.5.4-py2.py3-none-any.whl",
          "filename": "shellingham-1.5.4-py2.py3-none-any.whl"
        },
        {
          "sha256": "8bb2b86ce44b5c5bb9949977177ddc36954c51097f81284d5ac48588e821ec07",
          "destination": "sherpa_onnx-1.13.8-cp311-cp311-macosx_11_0_arm64.whl",
          "filename": "sherpa_onnx-1.13.8-cp311-cp311-macosx_11_0_arm64.whl"
        },
        {
          "sha256": "9312bbd46c93e31cecd3abda9cc8e71881d86cc3da3c35c7445ab04025b9fc3e",
          "destination": "sherpa_onnx_core-1.13.8-py3-none-macosx_11_0_arm64.whl",
          "filename": "sherpa_onnx_core-1.13.8-py3-none-macosx_11_0_arm64.whl"
        },
        {
          "sha256": "4721f391ed90541fddacab5acf947aa0d3dc7d27b2e1e8eda2be8970586c3274",
          "destination": "six-1.17.0-py2.py3-none-any.whl",
          "filename": "six-1.17.0-py2.py3-none-any.whl"
        },
        {
          "sha256": "d828d35a059626da52f1415b5faee610aeab393319cb3fc4a9aef47b619fc14c",
          "destination": "soundfile-0.14.0-py2.py3-none-macosx_11_0_arm64.whl",
          "filename": "soundfile-0.14.0-py2.py3-none-macosx_11_0_arm64.whl"
        },
        {
          "sha256": "54a4a89ab8b6153cbf61ed6297ac836face23d8664a6efefc557a22ed448bc6f",
          "destination": "sox-1.5.0-py3-none-any.whl",
          "filename": "sox-1.5.0-py3-none-any.whl"
        },
        {
          "sha256": "bd30f7201eac896ebf5db7b09156e6f1a1b82601900d29d9c8449bdad8365b11",
          "destination": "soxr-1.1.0-cp311-cp311-macosx_11_0_arm64.whl",
          "filename": "soxr-1.1.0-cp311-cp311-macosx_11_0_arm64.whl"
        },
        {
          "sha256": "2aed0ced1f0f74f7bdd0bdc24a979c5cb9ee4a28393642db52a83d174ed65b7a",
          "destination": "soynlp-0.0.493-py3-none-any.whl",
          "filename": "soynlp-0.0.493-py3-none-any.whl"
        },
        {
          "sha256": "67f8e99895493dd2911a03f11314af6ceebeae4e704bb9f43dfc6a9db151c93e",
          "destination": "starlette-1.7.0-py3-none-any.whl",
          "filename": "starlette-1.7.0-py3-none-any.whl"
        },
        {
          "sha256": "e091cc3e99d2141a0ba2847328f5479b05d94a6635cb96148ccb3f34671bd8f5",
          "destination": "sympy-1.14.0-py3-none-any.whl",
          "filename": "sympy-1.14.0-py3-none-any.whl"
        },
        {
          "sha256": "cd8b60b5641b45c67bbf73c64c843235fc2d8a480c87389f52f5dbee893b86be",
          "destination": "threadpoolctl-3.7.0-py3-none-any.whl",
          "filename": "threadpoolctl-3.7.0-py3-none-any.whl"
        },
        {
          "sha256": "1e418a55456beedca4621dbab65a318981467a2b188e982a23e117f115ce5001",
          "destination": "tokenizers-0.22.2-cp39-abi3-macosx_11_0_arm64.whl",
          "filename": "tokenizers-0.22.2-cp39-abi3-macosx_11_0_arm64.whl"
        },
        {
          "sha256": "592064ed85b40fa213469f81ac584f67a4f2992509a7c3ea2d632208623a3680",
          "destination": "tomlkit-0.14.0-py3-none-any.whl",
          "filename": "tomlkit-0.14.0-py3-none-any.whl"
        },
        {
          "sha256": "5ae0524688fb6707c57a530c2325e13bb0090b745ba7b4a2cd6a3ce262572916",
          "destination": "torch-2.8.0-cp311-none-macosx_11_0_arm64.whl",
          "filename": "torch-2.8.0-cp311-none-macosx_11_0_arm64.whl"
        },
        {
          "sha256": "c293e525e6fef9c20e8728fd4612df02a0aa31bb5fe91ecd93e123b1b7bffa73",
          "destination": "tqdm-4.70.1-py3-none-any.whl",
          "filename": "tqdm-4.70.1-py3-none-any.whl"
        },
        {
          "sha256": "4c9e9de11333ddfe5114bc872c9f370509198acf0b87a832a0ab9458e2bd0550",
          "destination": "transformers-4.57.6-py3-none-any.whl",
          "filename": "transformers-4.57.6-py3-none-any.whl"
        },
        {
          "sha256": "b3a5fc4342d5fc8fda8fc3010b1cf117e9249aab7fae800c2eff62fd3842d97d",
          "destination": "typer-0.27.2-py3-none-any.whl",
          "filename": "typer-0.27.2-py3-none-any.whl"
        },
        {
          "sha256": "481caa481374e813c1b176ada14e97f1f67a4539ce9cfeb3f350d78d6370c2e8",
          "destination": "typing_extensions-4.16.0-py3-none-any.whl",
          "filename": "typing_extensions-4.16.0-py3-none-any.whl"
        },
        {
          "sha256": "65b8397ba37ccbce054456aaccddfc91e6e3083c92824df348d96ca832f3f147",
          "destination": "typing_inspection-0.4.4-py3-none-any.whl",
          "filename": "typing_inspection-0.4.4-py3-none-any.whl"
        },
        {
          "sha256": "b683bd1b6659ddcd810ff02ad09ba821d4bf1065072805063eb35c49617905ac",
          "destination": "tzdata-2026.5-py2.py3-none-any.whl",
          "filename": "tzdata-2026.5-py2.py3-none-any.whl"
        },
        {
          "sha256": "0cf3cae568d36aa9576b28dfb35f11328f1cb974ca7647d9475ebb86c75ac6e3",
          "destination": "urllib3-2.8.0-py3-none-any.whl",
          "filename": "urllib3-2.8.0-py3-none-any.whl"
        },
        {
          "sha256": "505bdb0f318731d45f1f712071fc781a8981f6847a31c902c9f5e652d4f67faf",
          "destination": "uvicorn-0.54.0-py3-none-any.whl",
          "filename": "uvicorn-0.54.0-py3-none-any.whl"
        },
        {
          "sha256": "6392e50c78460ba618e5b21f08a71f59c99ce99cdc6cf6e3dd7e6ccca8754fab",
          "destination": "werkzeug-3.1.9-py3-none-any.whl",
          "filename": "werkzeug-3.1.9-py3-none-any.whl"
        }
      ],
      "packages": [
        "sherpa-onnx==1.13.8",
        "numpy==2.2.6",
        "torch==2.8.0",
        "qwen-asr==0.0.6",
        "huggingface-hub>=0.30"
      ],
      "dependenciesVerified": true,
      "enabled": true,
      "platformVerified": true
    },
    {
      "id": "darwin-x64-onnx-cpu",
      "version": "1",
      "platform": "darwin",
      "arch": "x64",
      "engine": "onnx",
      "accelerator": "cpu",
      "python": {
        "sha256": "4338dc0c2b954f20ca6437406db5b806626c69bae3cafeec43f1b7d57dd72a88",
        "format": "tar.gz",
        "destination": "cpython-3.11.17+20261003-x86_64-apple-darwin-install_only.tar.gz",
        "executable": "python/bin/python3.11",
        "filename": "cpython-3.11.17+20261003-x86_64-apple-darwin-install_only.tar.gz"
      },
      "wheels": [
        {
          "sha256": "f9f1adb22318e121c5c69a09142811a201ef17ab257a1e66ca3025065b7f53ae",
          "destination": "numpy-2.2.6-cp311-cp311-macosx_10_9_x86_64.whl",
          "filename": "numpy-2.2.6-cp311-cp311-macosx_10_9_x86_64.whl"
        },
        {
          "sha256": "6d67a2b4e7f14d8b31b8b52648866fa717f45a1eb70e83002f4331d07e953717",
          "destination": "pip-25.2-py3-none-any.whl",
          "filename": "pip-25.2-py3-none-any.whl"
        },
        {
          "sha256": "a00d9ceeb4d9531d2f5bd90d194d53408461c5aa6ff46e65f8776ed37007f3d0",
          "destination": "sherpa_onnx-1.13.8-cp311-cp311-macosx_10_15_x86_64.whl",
          "filename": "sherpa_onnx-1.13.8-cp311-cp311-macosx_10_15_x86_64.whl"
        },
        {
          "sha256": "917422880287baa0f0ae1bd10d9528fa78af8cc7c233d2a953a185a4fe8d83f2",
          "destination": "sherpa_onnx_core-1.13.8-py3-none-macosx_10_15_x86_64.whl",
          "filename": "sherpa_onnx_core-1.13.8-py3-none-macosx_10_15_x86_64.whl"
        }
      ],
      "packages": [
        "sherpa-onnx==1.13.8",
        "numpy==2.2.6"
      ],
      "dependenciesVerified": true,
      "enabled": true,
      "platformVerified": true
    },
    {
      "id": "darwin-x64-transformers-cpu",
      "version": "1",
      "platform": "darwin",
      "arch": "x64",
      "engine": "transformers",
      "accelerator": "cpu",
      "python": {
        "sha256": "4338dc0c2b954f20ca6437406db5b806626c69bae3cafeec43f1b7d57dd72a88",
        "format": "tar.gz",
        "destination": "cpython-3.11.17+20261003-x86_64-apple-darwin-install_only.tar.gz",
        "executable": "python/bin/python3.11",
        "filename": "cpython-3.11.17+20261003-x86_64-apple-darwin-install_only.tar.gz"
      },
      "wheels": [
        {
          "sha256": "3e2091cd341423207e2f084a6654b1efcd250dc326f2a37d6dde446e07cabb11",
          "destination": "accelerate-1.12.0-py3-none-any.whl",
          "filename": "accelerate-1.12.0-py3-none-any.whl"
        },
        {
          "sha256": "117bac03a25ede5df5440e855b32d556049ca169ead221505badf432fed4b101",
          "destination": "annotated_doc-0.0.5-py3-none-any.whl",
          "filename": "annotated_doc-0.0.5-py3-none-any.whl"
        },
        {
          "sha256": "f072f4d804ea359e4eaf198b1af7a8b0943881a87f31bb764f8bf219bb9419e0",
          "destination": "annotated_types-0.8.0-py3-none-any.whl",
          "filename": "annotated_types-0.8.0-py3-none-any.whl"
        },
        {
          "sha256": "6152fdbbf9a77fdec97731721bebf7c4c44f7c29b424b0065826173efc7ed101",
          "destination": "anyio-4.15.1-py3-none-any.whl",
          "filename": "anyio-4.15.1-py3-none-any.whl"
        },
        {
          "sha256": "b30d1df6c5d3de5dcef0fb0e256f6ea17bdcf5f979408df0297d8a408e2971b4",
          "destination": "audioread-3.1.0-py3-none-any.whl",
          "filename": "audioread-3.1.0-py3-none-any.whl"
        },
        {
          "sha256": "ae75d8bb6467895ed1f8572ededf7ffa49eac07f6e483222f5d7d62a41d12f04",
          "destination": "av-18.1.0-cp311-abi3-macosx_11_0_x86_64.whl",
          "filename": "av-18.1.0-cp311-abi3-macosx_11_0_x86_64.whl"
        },
        {
          "sha256": "ba0efaa9080b619ff2f3459d1d500c57bddea4a6b424b60a91141db6fd2f08bc",
          "destination": "blinker-1.9.0-py3-none-any.whl",
          "filename": "blinker-1.9.0-py3-none-any.whl"
        },
        {
          "sha256": "898be2be399c221d2671d29eed26b6b2713a02c2119168ed914e7d00ceadb56f",
          "destination": "brotli-1.2.0-cp311-cp311-macosx_10_9_x86_64.whl",
          "filename": "brotli-1.2.0-cp311-cp311-macosx_10_9_x86_64.whl"
        },
        {
          "sha256": "62f22742b58a1a33014a2b6b706588a8d7e2a88ae7bd1a6ebe8c992928483775",
          "destination": "certifi-2026.7.22-py3-none-any.whl",
          "filename": "certifi-2026.7.22-py3-none-any.whl"
        },
        {
          "sha256": "c8d2c9fd1f2d16f780d15127abb050d13d1a76c03a4bd87d7e4980e45e511e12",
          "destination": "cffi-2.1.1-cp311-cp311-macosx_10_15_x86_64.whl",
          "filename": "cffi-2.1.1-cp311-cp311-macosx_10_15_x86_64.whl"
        },
        {
          "sha256": "3d21b8b13c7592db2ac5e544a6d83187b995257472b0c9e8351b6d507ae37ed6",
          "destination": "charset_normalizer-3.5.2-cp311-cp311-macosx_10_9_universal2.whl",
          "filename": "charset_normalizer-3.5.2-cp311-cp311-macosx_10_9_universal2.whl"
        },
        {
          "sha256": "255bc9599cf7748b4b1a446ccc735421bd08a2ae529a8b88597d3de5664ee360",
          "destination": "click-8.5.0-py3-none-any.whl",
          "filename": "click-8.5.0-py3-none-any.whl"
        },
        {
          "sha256": "9acb47f6afd73f60dc1df93bb801b472f05ff42fa6c84167d25cb206be1fbf4a",
          "destination": "cloudpickle-3.1.2-py3-none-any.whl",
          "filename": "cloudpickle-3.1.2-py3-none-any.whl"
        },
        {
          "sha256": "4f1d9991f5acc0ca119f9d443620b77f9d6b33703e51011c16baf57afb285fc6",
          "destination": "colorama-0.4.6-py2.py3-none-any.whl",
          "filename": "colorama-0.4.6-py2.py3-none-any.whl"
        },
        {
          "sha256": "e0d2713d2b292c826bc21dc8732bd9e47628103aa3764180c881e04b3fef95dc",
          "destination": "cython-3.3.0-cp39-abi3-macosx_10_9_x86_64.whl",
          "filename": "cython-3.3.0-cp39-abi3-macosx_10_9_x86_64.whl"
        },
        {
          "sha256": "f47fe6fdbd2edd623ecfe36875d37aba411624e2670dd395dddae1358689bb3c",
          "destination": "decorator-5.3.1-py3-none-any.whl",
          "filename": "decorator-5.3.1-py3-none-any.whl"
        },
        {
          "sha256": "fed13baeb332b9d761ffd3e61983e4b0a107ab57e0e5fbde90e3f94d059306c8",
          "destination": "dynet38-2.2-cp311-cp311-macosx_10_9_x86_64.whl",
          "filename": "dynet38-2.2-cp311-cp311-macosx_10_9_x86_64.whl"
        },
        {
          "sha256": "bd5f4d81f1e93a88bcd77caf4dfe3c2dbffc3805407a0007e9a114c18b3a670b",
          "destination": "fastapi-0.142.2-py3-none-any.whl",
          "filename": "fastapi-0.142.2-py3-none-any.whl"
        },
        {
          "sha256": "5f17ee83ecee8a6f3e389c75822fb70a1c2f0506b99438a6dffa1d56793588c8",
          "destination": "filelock-4.0.12-py3-none-any.whl",
          "filename": "filelock-4.0.12-py3-none-any.whl"
        },
        {
          "sha256": "f4bcbefc124291925f1a26446da31a5178f9483862233b23c0c96a20701f670c",
          "destination": "flask-3.1.3-py3-none-any.whl",
          "filename": "flask-3.1.3-py3-none-any.whl"
        },
        {
          "sha256": "8dd6e646e99ea382bd85f97a45e6b526a442d79423a7dc673f1e2756d05fcb5f",
          "destination": "fsspec-2026.9.0-py3-none-any.whl",
          "filename": "fsspec-2026.9.0-py3-none-any.whl"
        },
        {
          "sha256": "7e52c65bfbb7bd75ac1c28cb38f93b01e5f6a2ff013224e6213533451bfee517",
          "destination": "gradio-6.17.3-py3-none-any.whl",
          "filename": "gradio-6.17.3-py3-none-any.whl"
        },
        {
          "sha256": "d43e2179c29076292a76485ad7ed2e6eaa19d14ac58283bd7f5beabfe4ca958c",
          "destination": "gradio_client-2.5.0-py3-none-any.whl",
          "filename": "gradio_client-2.5.0-py3-none-any.whl"
        },
        {
          "sha256": "7f7975bab18c729a257a8b1ae9dcd70b7cafb1720481beae47719af57c35fa64",
          "destination": "groovy-0.1.2-py3-none-any.whl",
          "filename": "groovy-0.1.2-py3-none-any.whl"
        },
        {
          "sha256": "63cf8bbe7522de3bf65932fda1d9c2772064ffb3dae62d55932da54b31cb6c86",
          "destination": "h11-0.16.0-py3-none-any.whl",
          "filename": "h11-0.16.0-py3-none-any.whl"
        },
        {
          "sha256": "76b8cb8be6abe62d74c1ad2d35b42f0629db89aa9e1a8d033cecfe7c856eeab3",
          "destination": "hf_gradio-0.4.1-py3-none-any.whl",
          "filename": "hf_gradio-0.4.1-py3-none-any.whl"
        },
        {
          "sha256": "633dc0cd71d32da58ab8c03ad38e2fac452c15c2b0a2866ebf6ededfe0a5061d",
          "destination": "hf_xet-1.6.0-cp38-abi3-macosx_10_12_x86_64.whl",
          "filename": "hf_xet-1.6.0-cp38-abi3-macosx_10_12_x86_64.whl"
        },
        {
          "sha256": "2d400746a40668fc9dec9810239072b40b4484b640a8c38fd654a024c7a1bf55",
          "destination": "httpcore-1.0.9-py3-none-any.whl",
          "filename": "httpcore-1.0.9-py3-none-any.whl"
        },
        {
          "sha256": "d909fcccc110f8c7faf814ca82a9a4d816bc5a6dbfea25d6591d6985b8ba59ad",
          "destination": "httpx-0.28.1-py3-none-any.whl",
          "filename": "httpx-0.28.1-py3-none-any.whl"
        },
        {
          "sha256": "48f0c8eac16145dfce371e9d2d7772854a4f591bcb56c9cf548accf531d54270",
          "destination": "huggingface_hub-0.36.2-py3-none-any.whl",
          "filename": "huggingface_hub-0.36.2-py3-none-any.whl"
        },
        {
          "sha256": "ab7ae7122974553370f0bdb919e1a960b2cd1bc1ef0276416d896db81c14582c",
          "destination": "idna-3.20-py3-none-any.whl",
          "filename": "idna-3.20-py3-none-any.whl"
        },
        {
          "sha256": "c6242fc49e35958c8b15141343aa660db5fc54d4f13a1db01a3f5891b98700ef",
          "destination": "itsdangerous-2.2.0-py3-none-any.whl",
          "filename": "itsdangerous-2.2.0-py3-none-any.whl"
        },
        {
          "sha256": "85ece4451f492d0c13c5dd7c13a64681a86afae63a5f347908daf103ce6d2f67",
          "destination": "jinja2-3.1.6-py3-none-any.whl",
          "filename": "jinja2-3.1.6-py3-none-any.whl"
        },
        {
          "sha256": "3dbbf9f6e4b592a2357b854608e980fe6390d131d7a82f011a377ef2ebef7aba",
          "destination": "joblib-1.6.0-py3-none-any.whl",
          "filename": "joblib-1.6.0-py3-none-any.whl"
        },
        {
          "sha256": "77253be3391b06124a0e16105bd663b6c54470af1a9ca8e1cf026f38d58ed056",
          "destination": "lazy_loader-0.6-py3-none-any.whl",
          "filename": "lazy_loader-0.6-py3-none-any.whl"
        },
        {
          "sha256": "0b6415c4fd68bff4c29288abe67c6d80b587e0e1e2cfb0aad23e4559504a7fa1",
          "destination": "librosa-0.11.0-py3-none-any.whl",
          "filename": "librosa-0.11.0-py3-none-any.whl"
        },
        {
          "sha256": "60f92868d5d3af30b4239b50e1717cb4e4e54f6ac1c361a27903b318d0f07f42",
          "destination": "llvmlite-0.45.1-cp311-cp311-macosx_10_15_x86_64.whl",
          "filename": "llvmlite-0.45.1-cp311-cp311-macosx_10_15_x86_64.whl"
        },
        {
          "sha256": "9f7ebbcd14fe59494226453aed97c1070d83f8d24b6fc3a3bcf9a38092641c4a",
          "destination": "markdown_it_py-4.2.0-py3-none-any.whl",
          "filename": "markdown_it_py-4.2.0-py3-none-any.whl"
        },
        {
          "sha256": "9e25feb9e330b63edb0278a0acdf85e50d0cb0fbf49c3084abbe4e24ae195346",
          "destination": "markupsafe-3.0.4-cp311-cp311-macosx_10_9_x86_64.whl",
          "filename": "markupsafe-3.0.4-cp311-cp311-macosx_10_9_x86_64.whl"
        },
        {
          "sha256": "84008a41e51615a49fc9966191ff91509e3c40b939176e643fd50a5c2196b8f8",
          "destination": "mdurl-0.1.2-py3-none-any.whl",
          "filename": "mdurl-0.1.2-py3-none-any.whl"
        },
        {
          "sha256": "a0b2b9fe80bbcd81a6647ff13108738cfb482d481d826cc0e02f5b35e5c88d2c",
          "destination": "mpmath-1.3.0-py3-none-any.whl",
          "filename": "mpmath-1.3.0-py3-none-any.whl"
        },
        {
          "sha256": "ec90a9ae3e1169fa1171147340f0e97d941aa19fcd3b34e8339a55933ed042af",
          "destination": "msgpack-1.2.3-cp311-cp311-macosx_10_9_x86_64.whl",
          "filename": "msgpack-1.2.3-cp311-cp311-macosx_10_9_x86_64.whl"
        },
        {
          "sha256": "41db2de9a2c39b7ea64deb8d89073e9dc2303157e3775fa03f6b17d872be3386",
          "destination": "nagisa-0.2.11-cp311-cp311-macosx_10_9_x86_64.whl",
          "filename": "nagisa-0.2.11-cp311-cp311-macosx_10_9_x86_64.whl"
        },
        {
          "sha256": "29326d74f107c347fd1009bd58e38d9f7c7c5b51e6de97bc93dbc325d9038b54",
          "destination": "narwhals-2.26.0-py3-none-any.whl",
          "filename": "narwhals-2.26.0-py3-none-any.whl"
        },
        {
          "sha256": "d47fbf302e7d9cbbb9e2555a0d267983d2aa476bac30e90dfbe5669bd57f3762",
          "destination": "networkx-3.6.1-py3-none-any.whl",
          "filename": "networkx-3.6.1-py3-none-any.whl"
        },
        {
          "sha256": "f43e24b057714e480fe44bc6031de499e7cf8150c63eb461192caa6cc8530bc8",
          "destination": "numba-0.62.1-cp311-cp311-macosx_10_15_x86_64.whl",
          "filename": "numba-0.62.1-cp311-cp311-macosx_10_15_x86_64.whl"
        },
        {
          "sha256": "4c66707fabe114439db9068ee468c26bbdf909cac0fb58686a42a24de1760c71",
          "destination": "numpy-1.26.4-cp311-cp311-macosx_10_9_x86_64.whl",
          "filename": "numpy-1.26.4-cp311-cp311-macosx_10_9_x86_64.whl"
        },
        {
          "sha256": "80e068aba7cd56c8b58512d6a36f8d25cb1dfaa0c0a4cc1c938ccf9f362d9cb3",
          "destination": "opentelemetry_api-1.45.0-py3-none-any.whl",
          "filename": "opentelemetry_api-1.45.0-py3-none-any.whl"
        },
        {
          "sha256": "a94f0f0c6fcbb2b5bd9734c57a489c7584a732bbdf04a39e8c83b861e9d03e92",
          "destination": "orjson-3.12.0-cp311-cp311-macosx_10_15_x86_64.macosx_11_0_arm64.macosx_10_15_universal2.whl",
          "filename": "orjson-3.12.0-cp311-cp311-macosx_10_15_x86_64.macosx_11_0_arm64.macosx_10_15_universal2.whl"
        },
        {
          "sha256": "d7193f7c8e4e93f444fde0262bf90af30e16fa0ad0ad44cb553c87339b23cd1c",
          "destination": "packaging-26.3-py3-none-any.whl",
          "filename": "packaging-26.3-py3-none-any.whl"
        },
        {
          "sha256": "085e3786ae6b2e82b406266bce36690f72b9dc1421903ba9296b2981a9fcf586",
          "destination": "pandas-3.0.6-cp311-cp311-macosx_10_9_x86_64.whl",
          "filename": "pandas-3.0.6-cp311-cp311-macosx_10_9_x86_64.whl"
        },
        {
          "sha256": "00808c5e14ef63ac5161091d242999076604ff74b883423a11e5d7bbb38bf756",
          "destination": "pillow-12.3.0-cp311-cp311-macosx_10_10_x86_64.whl",
          "filename": "pillow-12.3.0-cp311-cp311-macosx_10_10_x86_64.whl"
        },
        {
          "sha256": "6d67a2b4e7f14d8b31b8b52648866fa717f45a1eb70e83002f4331d07e953717",
          "destination": "pip-25.2-py3-none-any.whl",
          "filename": "pip-25.2-py3-none-any.whl"
        },
        {
          "sha256": "080f3b39423b5abfca9a23d84c4e9795f54d395cd8459867a8ded44084fcd5f8",
          "destination": "platformdirs-4.12.3-py3-none-any.whl",
          "filename": "platformdirs-4.12.3-py3-none-any.whl"
        },
        {
          "sha256": "f265597baa9f760d25ceb29d0beb8186c243d6607b0f60b83ecf14078dbc703b",
          "destination": "pooch-1.9.0-py3-none-any.whl",
          "filename": "pooch-1.9.0-py3-none-any.whl"
        },
        {
          "sha256": "ed0cace939114f62738d808fdcecd4c869222507e266e574799e9c0faa17d486",
          "destination": "psutil-7.2.2-cp36-abi3-macosx_10_9_x86_64.whl",
          "filename": "psutil-7.2.2-cp36-abi3-macosx_10_9_x86_64.whl"
        },
        {
          "sha256": "b727414169a36b7d524c1c3e31839a521725078d7b2ff038656844266160a992",
          "destination": "pycparser-3.0-py3-none-any.whl",
          "filename": "pycparser-3.0-py3-none-any.whl"
        },
        {
          "sha256": "346a034f080da3755d8e9cb5e00e8b07de1d39e4f6e2c87d8ab7cafa0b269a73",
          "destination": "pydantic-2.13.5-py3-none-any.whl",
          "filename": "pydantic-2.13.5-py3-none-any.whl"
        },
        {
          "sha256": "a1dee1b804ff4d11c663636cf15d2ea47e9f79cd56c033fb1cbf08924842a48f",
          "destination": "pydantic_core-2.46.5-cp311-cp311-macosx_10_12_x86_64.whl",
          "filename": "pydantic_core-2.46.5-cp311-cp311-macosx_10_12_x86_64.whl"
        },
        {
          "sha256": "65617e33033874b59d87db603aa1ed450633288aefead953b30bded59cb599a6",
          "destination": "pydub-0.25.1-py2.py3-none-any.whl",
          "filename": "pydub-0.25.1-py2.py3-none-any.whl"
        },
        {
          "sha256": "2363c69b61c4a97c838da3b130dcd6468f4848992b21a82f2a63ec34377137d9",
          "destination": "pygments-2.21.0-py3-none-any.whl",
          "filename": "pygments-2.21.0-py3-none-any.whl"
        },
        {
          "sha256": "a8b2bc7bffae282281c8140a97d3aa9c14da0b136dfe83f850eea9a5f7470427",
          "destination": "python_dateutil-2.9.0.post0-py2.py3-none-any.whl",
          "filename": "python_dateutil-2.9.0.post0-py2.py3-none-any.whl"
        },
        {
          "sha256": "ff6d3f776f16878c894e52e107296ffc890e913c611b1a4ec6c44e2821fe2e23",
          "destination": "python_multipart-0.0.32-py3-none-any.whl",
          "filename": "python_multipart-0.0.32-py3-none-any.whl"
        },
        {
          "sha256": "e658af3757f9e26a9d25dd2aff38335acd92bc9104f890a894b2c1ba28311b03",
          "destination": "pytz-2026.5-py2.py3-none-any.whl",
          "filename": "pytz-2026.5-py2.py3-none-any.whl"
        },
        {
          "sha256": "44edc647873928551a01e7a563d7452ccdebee747728c1080d881d68af7b997e",
          "destination": "pyyaml-6.0.3-cp311-cp311-macosx_10_13_x86_64.whl",
          "filename": "pyyaml-6.0.3-cp311-cp311-macosx_10_13_x86_64.whl"
        },
        {
          "sha256": "b9c55a38413298f3a990a4475467399daec6e8f4172363053fc42e2166c2dfd3",
          "destination": "qwen_asr-0.0.6-py3-none-any.whl",
          "filename": "qwen_asr-0.0.6-py3-none-any.whl"
        },
        {
          "sha256": "f111db07af669c83333411c5177131e18e831fe666d6a55a1af263952ada8939",
          "destination": "qwen_omni_utils-0.0.9-py3-none-any.whl",
          "filename": "qwen_omni_utils-0.0.9-py3-none-any.whl"
        },
        {
          "sha256": "b7b893976e7fe42053da64f2aa27239c24252fd2ec6df471e1be197c0addc3b1",
          "destination": "regex-2026.9.29-cp311-cp311-macosx_10_9_x86_64.whl",
          "filename": "regex-2026.9.29-cp311-cp311-macosx_10_9_x86_64.whl"
        },
        {
          "sha256": "2a0d60c172f83ac6ab31e4554906c0f3b3588d37b5cb939b1c061f4907e278e0",
          "destination": "requests-2.34.2-py3-none-any.whl",
          "filename": "requests-2.34.2-py3-none-any.whl"
        },
        {
          "sha256": "33bd4ef74232fb73fe9279a257718407f169c09b78a87ad3d296f548e27de0bb",
          "destination": "rich-15.0.0-py3-none-any.whl",
          "filename": "rich-15.0.0-py3-none-any.whl"
        },
        {
          "sha256": "c4f4a162db6993464d7ca3d7cc4af0ffc6515a606dfd220b9f82c6945d869cde",
          "destination": "safehttpx-0.1.7-py3-none-any.whl",
          "filename": "safehttpx-0.1.7-py3-none-any.whl"
        },
        {
          "sha256": "c554f85858e05226d3c2828e32395e677434685d6d94594a41643361c5e837f0",
          "destination": "safetensors-0.8.0-cp310-abi3-macosx_10_12_x86_64.whl",
          "filename": "safetensors-0.8.0-cp310-abi3-macosx_10_12_x86_64.whl"
        },
        {
          "sha256": "326c188f92084bf58664229f4578eeab6176313b37cd5dfc85abd92b94130c58",
          "destination": "scikit_learn-1.9.1-cp311-cp311-macosx_10_9_x86_64.whl",
          "filename": "scikit_learn-1.9.1-cp311-cp311-macosx_10_9_x86_64.whl"
        },
        {
          "sha256": "1f95b894f13729334fb990162e911c9e5dc1ab390c58aa6cbecb389c5b5e28ec",
          "destination": "scipy-1.17.1-cp311-cp311-macosx_10_14_x86_64.whl",
          "filename": "scipy-1.17.1-cp311-cp311-macosx_10_14_x86_64.whl"
        },
        {
          "sha256": "de78a3b8e0feda74cabc54aab2da702113e33ac9d9eb9d2389bcf1f58b7d9177",
          "destination": "semantic_version-2.10.0-py2.py3-none-any.whl",
          "filename": "semantic_version-2.10.0-py2.py3-none-any.whl"
        },
        {
          "sha256": "7ecfff8f2fd72616f7481040475a65b2bf8af90a56c89140852d1120324e8686",
          "destination": "shellingham-1.5.4-py2.py3-none-any.whl",
          "filename": "shellingham-1.5.4-py2.py3-none-any.whl"
        },
        {
          "sha256": "a00d9ceeb4d9531d2f5bd90d194d53408461c5aa6ff46e65f8776ed37007f3d0",
          "destination": "sherpa_onnx-1.13.8-cp311-cp311-macosx_10_15_x86_64.whl",
          "filename": "sherpa_onnx-1.13.8-cp311-cp311-macosx_10_15_x86_64.whl"
        },
        {
          "sha256": "917422880287baa0f0ae1bd10d9528fa78af8cc7c233d2a953a185a4fe8d83f2",
          "destination": "sherpa_onnx_core-1.13.8-py3-none-macosx_10_15_x86_64.whl",
          "filename": "sherpa_onnx_core-1.13.8-py3-none-macosx_10_15_x86_64.whl"
        },
        {
          "sha256": "4721f391ed90541fddacab5acf947aa0d3dc7d27b2e1e8eda2be8970586c3274",
          "destination": "six-1.17.0-py2.py3-none-any.whl",
          "filename": "six-1.17.0-py2.py3-none-any.whl"
        },
        {
          "sha256": "19be05428da76ed61a4cad29b8e4bcf43a3e5c100089d2ec81dc961eed1b0dd4",
          "destination": "soundfile-0.14.0-py2.py3-none-macosx_10_9_x86_64.whl",
          "filename": "soundfile-0.14.0-py2.py3-none-macosx_10_9_x86_64.whl"
        },
        {
          "sha256": "54a4a89ab8b6153cbf61ed6297ac836face23d8664a6efefc557a22ed448bc6f",
          "destination": "sox-1.5.0-py3-none-any.whl",
          "filename": "sox-1.5.0-py3-none-any.whl"
        },
        {
          "sha256": "34cc92208c3c412c046813e69da639c04a792c6a41fbfd7d909d359cd3e97a2d",
          "destination": "soxr-1.1.0-cp311-cp311-macosx_10_14_x86_64.whl",
          "filename": "soxr-1.1.0-cp311-cp311-macosx_10_14_x86_64.whl"
        },
        {
          "sha256": "2aed0ced1f0f74f7bdd0bdc24a979c5cb9ee4a28393642db52a83d174ed65b7a",
          "destination": "soynlp-0.0.493-py3-none-any.whl",
          "filename": "soynlp-0.0.493-py3-none-any.whl"
        },
        {
          "sha256": "67f8e99895493dd2911a03f11314af6ceebeae4e704bb9f43dfc6a9db151c93e",
          "destination": "starlette-1.7.0-py3-none-any.whl",
          "filename": "starlette-1.7.0-py3-none-any.whl"
        },
        {
          "sha256": "e091cc3e99d2141a0ba2847328f5479b05d94a6635cb96148ccb3f34671bd8f5",
          "destination": "sympy-1.14.0-py3-none-any.whl",
          "filename": "sympy-1.14.0-py3-none-any.whl"
        },
        {
          "sha256": "cd8b60b5641b45c67bbf73c64c843235fc2d8a480c87389f52f5dbee893b86be",
          "destination": "threadpoolctl-3.7.0-py3-none-any.whl",
          "filename": "threadpoolctl-3.7.0-py3-none-any.whl"
        },
        {
          "sha256": "544dd704ae7238755d790de45ba8da072e9af3eea688f698b137915ae959281c",
          "destination": "tokenizers-0.22.2-cp39-abi3-macosx_10_12_x86_64.whl",
          "filename": "tokenizers-0.22.2-cp39-abi3-macosx_10_12_x86_64.whl"
        },
        {
          "sha256": "592064ed85b40fa213469f81ac584f67a4f2992509a7c3ea2d632208623a3680",
          "destination": "tomlkit-0.14.0-py3-none-any.whl",
          "filename": "tomlkit-0.14.0-py3-none-any.whl"
        },
        {
          "sha256": "95b9b44f3bcebd8b6cd8d37ec802048c872d9c567ba52c894bba90863a439059",
          "destination": "torch-2.2.2-cp311-none-macosx_10_9_x86_64.whl",
          "filename": "torch-2.2.2-cp311-none-macosx_10_9_x86_64.whl"
        },
        {
          "sha256": "c293e525e6fef9c20e8728fd4612df02a0aa31bb5fe91ecd93e123b1b7bffa73",
          "destination": "tqdm-4.70.1-py3-none-any.whl",
          "filename": "tqdm-4.70.1-py3-none-any.whl"
        },
        {
          "sha256": "4c9e9de11333ddfe5114bc872c9f370509198acf0b87a832a0ab9458e2bd0550",
          "destination": "transformers-4.57.6-py3-none-any.whl",
          "filename": "transformers-4.57.6-py3-none-any.whl"
        },
        {
          "sha256": "b3a5fc4342d5fc8fda8fc3010b1cf117e9249aab7fae800c2eff62fd3842d97d",
          "destination": "typer-0.27.2-py3-none-any.whl",
          "filename": "typer-0.27.2-py3-none-any.whl"
        },
        {
          "sha256": "481caa481374e813c1b176ada14e97f1f67a4539ce9cfeb3f350d78d6370c2e8",
          "destination": "typing_extensions-4.16.0-py3-none-any.whl",
          "filename": "typing_extensions-4.16.0-py3-none-any.whl"
        },
        {
          "sha256": "65b8397ba37ccbce054456aaccddfc91e6e3083c92824df348d96ca832f3f147",
          "destination": "typing_inspection-0.4.4-py3-none-any.whl",
          "filename": "typing_inspection-0.4.4-py3-none-any.whl"
        },
        {
          "sha256": "b683bd1b6659ddcd810ff02ad09ba821d4bf1065072805063eb35c49617905ac",
          "destination": "tzdata-2026.5-py2.py3-none-any.whl",
          "filename": "tzdata-2026.5-py2.py3-none-any.whl"
        },
        {
          "sha256": "0cf3cae568d36aa9576b28dfb35f11328f1cb974ca7647d9475ebb86c75ac6e3",
          "destination": "urllib3-2.8.0-py3-none-any.whl",
          "filename": "urllib3-2.8.0-py3-none-any.whl"
        },
        {
          "sha256": "505bdb0f318731d45f1f712071fc781a8981f6847a31c902c9f5e652d4f67faf",
          "destination": "uvicorn-0.54.0-py3-none-any.whl",
          "filename": "uvicorn-0.54.0-py3-none-any.whl"
        },
        {
          "sha256": "6392e50c78460ba618e5b21f08a71f59c99ce99cdc6cf6e3dd7e6ccca8754fab",
          "destination": "werkzeug-3.1.9-py3-none-any.whl",
          "filename": "werkzeug-3.1.9-py3-none-any.whl"
        }
      ],
      "packages": [
        "sherpa-onnx==1.13.8",
        "numpy==1.26.4",
        "torch==2.2.2",
        "qwen-asr==0.0.6",
        "huggingface-hub>=0.30"
      ],
      "dependenciesVerified": true,
      "enabled": true,
      "platformVerified": true
    },
    {
      "id": "linux-x64-onnx-cpu",
      "version": "1",
      "platform": "linux",
      "arch": "x64",
      "engine": "onnx",
      "accelerator": "cpu",
      "python": {
        "sha256": "c624af93ad62a596806bbd2404e1fb80744a407ca7279854445ede16d93858b8",
        "format": "tar.gz",
        "destination": "cpython-3.11.17+20261003-x86_64-unknown-linux-gnu-install_only.tar.gz",
        "executable": "python/bin/python3.11",
        "filename": "cpython-3.11.17+20261003-x86_64-unknown-linux-gnu-install_only.tar.gz"
      },
      "wheels": [
        {
          "sha256": "ba10f8411898fc418a521833e014a77d3ca01c15b0c6cdcce6a0d2897e6dbbdf",
          "destination": "numpy-2.2.6-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
          "filename": "numpy-2.2.6-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl"
        },
        {
          "sha256": "6d67a2b4e7f14d8b31b8b52648866fa717f45a1eb70e83002f4331d07e953717",
          "destination": "pip-25.2-py3-none-any.whl",
          "filename": "pip-25.2-py3-none-any.whl"
        },
        {
          "sha256": "94fd1476b56ed36b851da8db9bd5144e92f669007ad54e0d8094913e4fbf1418",
          "destination": "sherpa_onnx-1.13.8-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
          "filename": "sherpa_onnx-1.13.8-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
        },
        {
          "sha256": "4da90acf435373d7b2ba9cc0be806e7e274d28f63f5780880b5dea6721626e36",
          "destination": "sherpa_onnx_core-1.13.8-py3-none-manylinux2014_x86_64.whl",
          "filename": "sherpa_onnx_core-1.13.8-py3-none-manylinux2014_x86_64.whl"
        }
      ],
      "packages": [
        "sherpa-onnx==1.13.8",
        "numpy==2.2.6"
      ],
      "dependenciesVerified": true,
      "enabled": true,
      "platformVerified": true
    },
    {
      "id": "linux-x64-transformers-cpu",
      "version": "1",
      "platform": "linux",
      "arch": "x64",
      "engine": "transformers",
      "accelerator": "cpu",
      "python": {
        "sha256": "c624af93ad62a596806bbd2404e1fb80744a407ca7279854445ede16d93858b8",
        "format": "tar.gz",
        "destination": "cpython-3.11.17+20261003-x86_64-unknown-linux-gnu-install_only.tar.gz",
        "executable": "python/bin/python3.11",
        "filename": "cpython-3.11.17+20261003-x86_64-unknown-linux-gnu-install_only.tar.gz"
      },
      "wheels": [
        {
          "sha256": "3e2091cd341423207e2f084a6654b1efcd250dc326f2a37d6dde446e07cabb11",
          "destination": "accelerate-1.12.0-py3-none-any.whl",
          "filename": "accelerate-1.12.0-py3-none-any.whl"
        },
        {
          "sha256": "117bac03a25ede5df5440e855b32d556049ca169ead221505badf432fed4b101",
          "destination": "annotated_doc-0.0.5-py3-none-any.whl",
          "filename": "annotated_doc-0.0.5-py3-none-any.whl"
        },
        {
          "sha256": "f072f4d804ea359e4eaf198b1af7a8b0943881a87f31bb764f8bf219bb9419e0",
          "destination": "annotated_types-0.8.0-py3-none-any.whl",
          "filename": "annotated_types-0.8.0-py3-none-any.whl"
        },
        {
          "sha256": "6152fdbbf9a77fdec97731721bebf7c4c44f7c29b424b0065826173efc7ed101",
          "destination": "anyio-4.15.1-py3-none-any.whl",
          "filename": "anyio-4.15.1-py3-none-any.whl"
        },
        {
          "sha256": "b30d1df6c5d3de5dcef0fb0e256f6ea17bdcf5f979408df0297d8a408e2971b4",
          "destination": "audioread-3.1.0-py3-none-any.whl",
          "filename": "audioread-3.1.0-py3-none-any.whl"
        },
        {
          "sha256": "8a032e8d8ebc73dec079364b9b4a6837638a2d106e8472314e685ffbf163e700",
          "destination": "av-18.1.0-cp311-abi3-manylinux_2_28_x86_64.whl",
          "filename": "av-18.1.0-cp311-abi3-manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "ba0efaa9080b619ff2f3459d1d500c57bddea4a6b424b60a91141db6fd2f08bc",
          "destination": "blinker-1.9.0-py3-none-any.whl",
          "filename": "blinker-1.9.0-py3-none-any.whl"
        },
        {
          "sha256": "40d918bce2b427a0c4ba189df7a006ac0c7277c180aee4617d99e9ccaaf59e6a",
          "destination": "brotli-1.2.0-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
          "filename": "brotli-1.2.0-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
        },
        {
          "sha256": "62f22742b58a1a33014a2b6b706588a8d7e2a88ae7bd1a6ebe8c992928483775",
          "destination": "certifi-2026.7.22-py3-none-any.whl",
          "filename": "certifi-2026.7.22-py3-none-any.whl"
        },
        {
          "sha256": "34e261f78cb6ceaaa36f42f2613f4380d94d9c759a9c73c769ee6e0247364632",
          "destination": "cffi-2.1.1-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
          "filename": "cffi-2.1.1-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
        },
        {
          "sha256": "211d5a3eb6af8f513b8d4ca19a8c1b7accab1b5f0d3175f9826b03c1a920dc1f",
          "destination": "charset_normalizer-3.5.2-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "charset_normalizer-3.5.2-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "255bc9599cf7748b4b1a446ccc735421bd08a2ae529a8b88597d3de5664ee360",
          "destination": "click-8.5.0-py3-none-any.whl",
          "filename": "click-8.5.0-py3-none-any.whl"
        },
        {
          "sha256": "9acb47f6afd73f60dc1df93bb801b472f05ff42fa6c84167d25cb206be1fbf4a",
          "destination": "cloudpickle-3.1.2-py3-none-any.whl",
          "filename": "cloudpickle-3.1.2-py3-none-any.whl"
        },
        {
          "sha256": "4f1d9991f5acc0ca119f9d443620b77f9d6b33703e51011c16baf57afb285fc6",
          "destination": "colorama-0.4.6-py2.py3-none-any.whl",
          "filename": "colorama-0.4.6-py2.py3-none-any.whl"
        },
        {
          "sha256": "e6035b5231a9316edc19d6415f4296fd1d0370e2a165a714b3edc167b9ca00e1",
          "destination": "cython-3.3.0-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "cython-3.3.0-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "f47fe6fdbd2edd623ecfe36875d37aba411624e2670dd395dddae1358689bb3c",
          "destination": "decorator-5.3.1-py3-none-any.whl",
          "filename": "decorator-5.3.1-py3-none-any.whl"
        },
        {
          "sha256": "8963383d935e802941c8f9d778403798452e172150c3b4b5dee288d50b62ecc8",
          "destination": "dyNET38-2.2-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
          "filename": "dyNET38-2.2-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl"
        },
        {
          "sha256": "bd5f4d81f1e93a88bcd77caf4dfe3c2dbffc3805407a0007e9a114c18b3a670b",
          "destination": "fastapi-0.142.2-py3-none-any.whl",
          "filename": "fastapi-0.142.2-py3-none-any.whl"
        },
        {
          "sha256": "5f17ee83ecee8a6f3e389c75822fb70a1c2f0506b99438a6dffa1d56793588c8",
          "destination": "filelock-4.0.12-py3-none-any.whl",
          "filename": "filelock-4.0.12-py3-none-any.whl"
        },
        {
          "sha256": "f4bcbefc124291925f1a26446da31a5178f9483862233b23c0c96a20701f670c",
          "destination": "flask-3.1.3-py3-none-any.whl",
          "filename": "flask-3.1.3-py3-none-any.whl"
        },
        {
          "sha256": "8dd6e646e99ea382bd85f97a45e6b526a442d79423a7dc673f1e2756d05fcb5f",
          "destination": "fsspec-2026.9.0-py3-none-any.whl",
          "filename": "fsspec-2026.9.0-py3-none-any.whl"
        },
        {
          "sha256": "7e52c65bfbb7bd75ac1c28cb38f93b01e5f6a2ff013224e6213533451bfee517",
          "destination": "gradio-6.17.3-py3-none-any.whl",
          "filename": "gradio-6.17.3-py3-none-any.whl"
        },
        {
          "sha256": "d43e2179c29076292a76485ad7ed2e6eaa19d14ac58283bd7f5beabfe4ca958c",
          "destination": "gradio_client-2.5.0-py3-none-any.whl",
          "filename": "gradio_client-2.5.0-py3-none-any.whl"
        },
        {
          "sha256": "7f7975bab18c729a257a8b1ae9dcd70b7cafb1720481beae47719af57c35fa64",
          "destination": "groovy-0.1.2-py3-none-any.whl",
          "filename": "groovy-0.1.2-py3-none-any.whl"
        },
        {
          "sha256": "63cf8bbe7522de3bf65932fda1d9c2772064ffb3dae62d55932da54b31cb6c86",
          "destination": "h11-0.16.0-py3-none-any.whl",
          "filename": "h11-0.16.0-py3-none-any.whl"
        },
        {
          "sha256": "76b8cb8be6abe62d74c1ad2d35b42f0629db89aa9e1a8d033cecfe7c856eeab3",
          "destination": "hf_gradio-0.4.1-py3-none-any.whl",
          "filename": "hf_gradio-0.4.1-py3-none-any.whl"
        },
        {
          "sha256": "d62671bb130879cef0ee4c9ebe47a14af6c66ec53e6d84dc15936e5ffdfac82f",
          "destination": "hf_xet-1.6.0-cp38-abi3-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
          "filename": "hf_xet-1.6.0-cp38-abi3-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
        },
        {
          "sha256": "2d400746a40668fc9dec9810239072b40b4484b640a8c38fd654a024c7a1bf55",
          "destination": "httpcore-1.0.9-py3-none-any.whl",
          "filename": "httpcore-1.0.9-py3-none-any.whl"
        },
        {
          "sha256": "d909fcccc110f8c7faf814ca82a9a4d816bc5a6dbfea25d6591d6985b8ba59ad",
          "destination": "httpx-0.28.1-py3-none-any.whl",
          "filename": "httpx-0.28.1-py3-none-any.whl"
        },
        {
          "sha256": "48f0c8eac16145dfce371e9d2d7772854a4f591bcb56c9cf548accf531d54270",
          "destination": "huggingface_hub-0.36.2-py3-none-any.whl",
          "filename": "huggingface_hub-0.36.2-py3-none-any.whl"
        },
        {
          "sha256": "ab7ae7122974553370f0bdb919e1a960b2cd1bc1ef0276416d896db81c14582c",
          "destination": "idna-3.20-py3-none-any.whl",
          "filename": "idna-3.20-py3-none-any.whl"
        },
        {
          "sha256": "c6242fc49e35958c8b15141343aa660db5fc54d4f13a1db01a3f5891b98700ef",
          "destination": "itsdangerous-2.2.0-py3-none-any.whl",
          "filename": "itsdangerous-2.2.0-py3-none-any.whl"
        },
        {
          "sha256": "85ece4451f492d0c13c5dd7c13a64681a86afae63a5f347908daf103ce6d2f67",
          "destination": "jinja2-3.1.6-py3-none-any.whl",
          "filename": "jinja2-3.1.6-py3-none-any.whl"
        },
        {
          "sha256": "3dbbf9f6e4b592a2357b854608e980fe6390d131d7a82f011a377ef2ebef7aba",
          "destination": "joblib-1.6.0-py3-none-any.whl",
          "filename": "joblib-1.6.0-py3-none-any.whl"
        },
        {
          "sha256": "77253be3391b06124a0e16105bd663b6c54470af1a9ca8e1cf026f38d58ed056",
          "destination": "lazy_loader-0.6-py3-none-any.whl",
          "filename": "lazy_loader-0.6-py3-none-any.whl"
        },
        {
          "sha256": "0b6415c4fd68bff4c29288abe67c6d80b587e0e1e2cfb0aad23e4559504a7fa1",
          "destination": "librosa-0.11.0-py3-none-any.whl",
          "filename": "librosa-0.11.0-py3-none-any.whl"
        },
        {
          "sha256": "a6ffde00d4be8772a24e3e8b3af6bf86a79e7cf066d944ef56136b3957d707dc",
          "destination": "llvmlite-0.50.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "llvmlite-0.50.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "9f7ebbcd14fe59494226453aed97c1070d83f8d24b6fc3a3bcf9a38092641c4a",
          "destination": "markdown_it_py-4.2.0-py3-none-any.whl",
          "filename": "markdown_it_py-4.2.0-py3-none-any.whl"
        },
        {
          "sha256": "6da83a088f8ef93b2d483a8232a4dbf4d69d3d8496b568a03c56becac43e1808",
          "destination": "markupsafe-3.0.4-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "markupsafe-3.0.4-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "84008a41e51615a49fc9966191ff91509e3c40b939176e643fd50a5c2196b8f8",
          "destination": "mdurl-0.1.2-py3-none-any.whl",
          "filename": "mdurl-0.1.2-py3-none-any.whl"
        },
        {
          "sha256": "a0b2b9fe80bbcd81a6647ff13108738cfb482d481d826cc0e02f5b35e5c88d2c",
          "destination": "mpmath-1.3.0-py3-none-any.whl",
          "filename": "mpmath-1.3.0-py3-none-any.whl"
        },
        {
          "sha256": "382b219de3d436de3baba0f4b0c6d4336e8f5858d0eb047918b13b69a71c6c55",
          "destination": "msgpack-1.2.3-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "msgpack-1.2.3-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "70d715680e33c48a8066a8588a52149d98644cddae1b5127cc5660c6418c81ce",
          "destination": "nagisa-0.2.11-cp311-cp311-manylinux_2_5_x86_64.manylinux1_x86_64.manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
          "filename": "nagisa-0.2.11-cp311-cp311-manylinux_2_5_x86_64.manylinux1_x86_64.manylinux_2_17_x86_64.manylinux2014_x86_64.whl"
        },
        {
          "sha256": "29326d74f107c347fd1009bd58e38d9f7c7c5b51e6de97bc93dbc325d9038b54",
          "destination": "narwhals-2.26.0-py3-none-any.whl",
          "filename": "narwhals-2.26.0-py3-none-any.whl"
        },
        {
          "sha256": "d47fbf302e7d9cbbb9e2555a0d267983d2aa476bac30e90dfbe5669bd57f3762",
          "destination": "networkx-3.6.1-py3-none-any.whl",
          "filename": "networkx-3.6.1-py3-none-any.whl"
        },
        {
          "sha256": "68f92839637a2aaca8ae124c3abf91f648d2fade50953ea8e81ec604ac05a771",
          "destination": "numba-0.68.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "numba-0.68.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "ba10f8411898fc418a521833e014a77d3ca01c15b0c6cdcce6a0d2897e6dbbdf",
          "destination": "numpy-2.2.6-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
          "filename": "numpy-2.2.6-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl"
        },
        {
          "sha256": "80e068aba7cd56c8b58512d6a36f8d25cb1dfaa0c0a4cc1c938ccf9f362d9cb3",
          "destination": "opentelemetry_api-1.45.0-py3-none-any.whl",
          "filename": "opentelemetry_api-1.45.0-py3-none-any.whl"
        },
        {
          "sha256": "9caf3d09f47c3c70c4451ada20ef9bc4a4cdffa26f49862cf0a253b329aae2d5",
          "destination": "orjson-3.12.0-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
          "filename": "orjson-3.12.0-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl"
        },
        {
          "sha256": "d7193f7c8e4e93f444fde0262bf90af30e16fa0ad0ad44cb553c87339b23cd1c",
          "destination": "packaging-26.3-py3-none-any.whl",
          "filename": "packaging-26.3-py3-none-any.whl"
        },
        {
          "sha256": "47121f9571503f724c9b93e297ab6254ac99c77adf5e9ed085ea419fd585c258",
          "destination": "pandas-3.0.6-cp311-cp311-manylinux_2_24_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "pandas-3.0.6-cp311-cp311-manylinux_2_24_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "23d27a3e0307ec2244cc51e7287b919aa68d097504ebe19df4e76a98a3eea5bd",
          "destination": "pillow-12.3.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "pillow-12.3.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "6d67a2b4e7f14d8b31b8b52648866fa717f45a1eb70e83002f4331d07e953717",
          "destination": "pip-25.2-py3-none-any.whl",
          "filename": "pip-25.2-py3-none-any.whl"
        },
        {
          "sha256": "080f3b39423b5abfca9a23d84c4e9795f54d395cd8459867a8ded44084fcd5f8",
          "destination": "platformdirs-4.12.3-py3-none-any.whl",
          "filename": "platformdirs-4.12.3-py3-none-any.whl"
        },
        {
          "sha256": "f265597baa9f760d25ceb29d0beb8186c243d6607b0f60b83ecf14078dbc703b",
          "destination": "pooch-1.9.0-py3-none-any.whl",
          "filename": "pooch-1.9.0-py3-none-any.whl"
        },
        {
          "sha256": "076a2d2f923fd4821644f5ba89f059523da90dc9014e85f8e45a5774ca5bc6f9",
          "destination": "psutil-7.2.2-cp36-abi3-manylinux2010_x86_64.manylinux_2_12_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "psutil-7.2.2-cp36-abi3-manylinux2010_x86_64.manylinux_2_12_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "b727414169a36b7d524c1c3e31839a521725078d7b2ff038656844266160a992",
          "destination": "pycparser-3.0-py3-none-any.whl",
          "filename": "pycparser-3.0-py3-none-any.whl"
        },
        {
          "sha256": "346a034f080da3755d8e9cb5e00e8b07de1d39e4f6e2c87d8ab7cafa0b269a73",
          "destination": "pydantic-2.13.5-py3-none-any.whl",
          "filename": "pydantic-2.13.5-py3-none-any.whl"
        },
        {
          "sha256": "49776eab08766a08dfff7012f8b422dcd7e25e43b316eedf0477c24fcfa84b7c",
          "destination": "pydantic_core-2.46.5-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
          "filename": "pydantic_core-2.46.5-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl"
        },
        {
          "sha256": "65617e33033874b59d87db603aa1ed450633288aefead953b30bded59cb599a6",
          "destination": "pydub-0.25.1-py2.py3-none-any.whl",
          "filename": "pydub-0.25.1-py2.py3-none-any.whl"
        },
        {
          "sha256": "2363c69b61c4a97c838da3b130dcd6468f4848992b21a82f2a63ec34377137d9",
          "destination": "pygments-2.21.0-py3-none-any.whl",
          "filename": "pygments-2.21.0-py3-none-any.whl"
        },
        {
          "sha256": "a8b2bc7bffae282281c8140a97d3aa9c14da0b136dfe83f850eea9a5f7470427",
          "destination": "python_dateutil-2.9.0.post0-py2.py3-none-any.whl",
          "filename": "python_dateutil-2.9.0.post0-py2.py3-none-any.whl"
        },
        {
          "sha256": "ff6d3f776f16878c894e52e107296ffc890e913c611b1a4ec6c44e2821fe2e23",
          "destination": "python_multipart-0.0.32-py3-none-any.whl",
          "filename": "python_multipart-0.0.32-py3-none-any.whl"
        },
        {
          "sha256": "e658af3757f9e26a9d25dd2aff38335acd92bc9104f890a894b2c1ba28311b03",
          "destination": "pytz-2026.5-py2.py3-none-any.whl",
          "filename": "pytz-2026.5-py2.py3-none-any.whl"
        },
        {
          "sha256": "b8bb0864c5a28024fac8a632c443c87c5aa6f215c0b126c449ae1a150412f31d",
          "destination": "pyyaml-6.0.3-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "pyyaml-6.0.3-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "b9c55a38413298f3a990a4475467399daec6e8f4172363053fc42e2166c2dfd3",
          "destination": "qwen_asr-0.0.6-py3-none-any.whl",
          "filename": "qwen_asr-0.0.6-py3-none-any.whl"
        },
        {
          "sha256": "f111db07af669c83333411c5177131e18e831fe666d6a55a1af263952ada8939",
          "destination": "qwen_omni_utils-0.0.9-py3-none-any.whl",
          "filename": "qwen_omni_utils-0.0.9-py3-none-any.whl"
        },
        {
          "sha256": "612b709381c0355b70d89cdb51b7f670591ed5cbbc0e3b5337488019dc667b65",
          "destination": "regex-2026.9.29-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "regex-2026.9.29-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "2a0d60c172f83ac6ab31e4554906c0f3b3588d37b5cb939b1c061f4907e278e0",
          "destination": "requests-2.34.2-py3-none-any.whl",
          "filename": "requests-2.34.2-py3-none-any.whl"
        },
        {
          "sha256": "33bd4ef74232fb73fe9279a257718407f169c09b78a87ad3d296f548e27de0bb",
          "destination": "rich-15.0.0-py3-none-any.whl",
          "filename": "rich-15.0.0-py3-none-any.whl"
        },
        {
          "sha256": "c4f4a162db6993464d7ca3d7cc4af0ffc6515a606dfd220b9f82c6945d869cde",
          "destination": "safehttpx-0.1.7-py3-none-any.whl",
          "filename": "safehttpx-0.1.7-py3-none-any.whl"
        },
        {
          "sha256": "fd6f3f93c9a0a7cc2788ee63fb763353d4bd2e89b0751bc78fcf7dda00bea774",
          "destination": "safetensors-0.8.0-cp310-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
          "filename": "safetensors-0.8.0-cp310-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl"
        },
        {
          "sha256": "52a0703bbc07ad27f560fa63fa68e4c54dd735bfbbf65b4dd3c225dc7547b6df",
          "destination": "scikit_learn-1.9.1-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "scikit_learn-1.9.1-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "43af8d1f3bea642559019edfe64e9b11192a8978efbd1539d7bc2aaa23d92de4",
          "destination": "scipy-1.17.1-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "scipy-1.17.1-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "de78a3b8e0feda74cabc54aab2da702113e33ac9d9eb9d2389bcf1f58b7d9177",
          "destination": "semantic_version-2.10.0-py2.py3-none-any.whl",
          "filename": "semantic_version-2.10.0-py2.py3-none-any.whl"
        },
        {
          "sha256": "7ecfff8f2fd72616f7481040475a65b2bf8af90a56c89140852d1120324e8686",
          "destination": "shellingham-1.5.4-py2.py3-none-any.whl",
          "filename": "shellingham-1.5.4-py2.py3-none-any.whl"
        },
        {
          "sha256": "94fd1476b56ed36b851da8db9bd5144e92f669007ad54e0d8094913e4fbf1418",
          "destination": "sherpa_onnx-1.13.8-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
          "filename": "sherpa_onnx-1.13.8-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
        },
        {
          "sha256": "4da90acf435373d7b2ba9cc0be806e7e274d28f63f5780880b5dea6721626e36",
          "destination": "sherpa_onnx_core-1.13.8-py3-none-manylinux2014_x86_64.whl",
          "filename": "sherpa_onnx_core-1.13.8-py3-none-manylinux2014_x86_64.whl"
        },
        {
          "sha256": "4721f391ed90541fddacab5acf947aa0d3dc7d27b2e1e8eda2be8970586c3274",
          "destination": "six-1.17.0-py2.py3-none-any.whl",
          "filename": "six-1.17.0-py2.py3-none-any.whl"
        },
        {
          "sha256": "1e38bac1853412871318e82a1ba69a8be677619b56025bbfcccdb41b6cafe82d",
          "destination": "soundfile-0.14.0-py2.py3-none-manylinux_2_28_x86_64.whl",
          "filename": "soundfile-0.14.0-py2.py3-none-manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "54a4a89ab8b6153cbf61ed6297ac836face23d8664a6efefc557a22ed448bc6f",
          "destination": "sox-1.5.0-py3-none-any.whl",
          "filename": "sox-1.5.0-py3-none-any.whl"
        },
        {
          "sha256": "3da87e3ffa3e41823d873b051c7ecb2acebd8d1b6b46b752f5facf10a0d84ab9",
          "destination": "soxr-1.1.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "soxr-1.1.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "2aed0ced1f0f74f7bdd0bdc24a979c5cb9ee4a28393642db52a83d174ed65b7a",
          "destination": "soynlp-0.0.493-py3-none-any.whl",
          "filename": "soynlp-0.0.493-py3-none-any.whl"
        },
        {
          "sha256": "67f8e99895493dd2911a03f11314af6ceebeae4e704bb9f43dfc6a9db151c93e",
          "destination": "starlette-1.7.0-py3-none-any.whl",
          "filename": "starlette-1.7.0-py3-none-any.whl"
        },
        {
          "sha256": "e091cc3e99d2141a0ba2847328f5479b05d94a6635cb96148ccb3f34671bd8f5",
          "destination": "sympy-1.14.0-py3-none-any.whl",
          "filename": "sympy-1.14.0-py3-none-any.whl"
        },
        {
          "sha256": "cd8b60b5641b45c67bbf73c64c843235fc2d8a480c87389f52f5dbee893b86be",
          "destination": "threadpoolctl-3.7.0-py3-none-any.whl",
          "filename": "threadpoolctl-3.7.0-py3-none-any.whl"
        },
        {
          "sha256": "369cc9fc8cc10cb24143873a0d95438bb8ee257bb80c71989e3ee290e8d72c67",
          "destination": "tokenizers-0.22.2-cp39-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
          "filename": "tokenizers-0.22.2-cp39-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl"
        },
        {
          "sha256": "592064ed85b40fa213469f81ac584f67a4f2992509a7c3ea2d632208623a3680",
          "destination": "tomlkit-0.14.0-py3-none-any.whl",
          "filename": "tomlkit-0.14.0-py3-none-any.whl"
        },
        {
          "sha256": "cb06175284673a581dd91fb1965662ae4ecaba6e5c357aa0ea7bb8b84b6b7eeb",
          "destination": "torch-2.8.0+cpu-cp311-cp311-manylinux_2_28_x86_64.whl",
          "filename": "torch-2.8.0+cpu-cp311-cp311-manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "c293e525e6fef9c20e8728fd4612df02a0aa31bb5fe91ecd93e123b1b7bffa73",
          "destination": "tqdm-4.70.1-py3-none-any.whl",
          "filename": "tqdm-4.70.1-py3-none-any.whl"
        },
        {
          "sha256": "4c9e9de11333ddfe5114bc872c9f370509198acf0b87a832a0ab9458e2bd0550",
          "destination": "transformers-4.57.6-py3-none-any.whl",
          "filename": "transformers-4.57.6-py3-none-any.whl"
        },
        {
          "sha256": "b3a5fc4342d5fc8fda8fc3010b1cf117e9249aab7fae800c2eff62fd3842d97d",
          "destination": "typer-0.27.2-py3-none-any.whl",
          "filename": "typer-0.27.2-py3-none-any.whl"
        },
        {
          "sha256": "481caa481374e813c1b176ada14e97f1f67a4539ce9cfeb3f350d78d6370c2e8",
          "destination": "typing_extensions-4.16.0-py3-none-any.whl",
          "filename": "typing_extensions-4.16.0-py3-none-any.whl"
        },
        {
          "sha256": "65b8397ba37ccbce054456aaccddfc91e6e3083c92824df348d96ca832f3f147",
          "destination": "typing_inspection-0.4.4-py3-none-any.whl",
          "filename": "typing_inspection-0.4.4-py3-none-any.whl"
        },
        {
          "sha256": "b683bd1b6659ddcd810ff02ad09ba821d4bf1065072805063eb35c49617905ac",
          "destination": "tzdata-2026.5-py2.py3-none-any.whl",
          "filename": "tzdata-2026.5-py2.py3-none-any.whl"
        },
        {
          "sha256": "0cf3cae568d36aa9576b28dfb35f11328f1cb974ca7647d9475ebb86c75ac6e3",
          "destination": "urllib3-2.8.0-py3-none-any.whl",
          "filename": "urllib3-2.8.0-py3-none-any.whl"
        },
        {
          "sha256": "505bdb0f318731d45f1f712071fc781a8981f6847a31c902c9f5e652d4f67faf",
          "destination": "uvicorn-0.54.0-py3-none-any.whl",
          "filename": "uvicorn-0.54.0-py3-none-any.whl"
        },
        {
          "sha256": "6392e50c78460ba618e5b21f08a71f59c99ce99cdc6cf6e3dd7e6ccca8754fab",
          "destination": "werkzeug-3.1.9-py3-none-any.whl",
          "filename": "werkzeug-3.1.9-py3-none-any.whl"
        }
      ],
      "packages": [
        "sherpa-onnx==1.13.8",
        "numpy==2.2.6",
        "torch==2.8.0+cpu",
        "qwen-asr==0.0.6",
        "huggingface-hub>=0.30"
      ],
      "dependenciesVerified": true,
      "enabled": true,
      "platformVerified": true
    },
    {
      "id": "linux-x64-transformers-cuda",
      "version": "1",
      "platform": "linux",
      "arch": "x64",
      "engine": "transformers",
      "accelerator": "cuda",
      "python": {
        "sha256": "c624af93ad62a596806bbd2404e1fb80744a407ca7279854445ede16d93858b8",
        "format": "tar.gz",
        "destination": "cpython-3.11.17+20261003-x86_64-unknown-linux-gnu-install_only.tar.gz",
        "executable": "python/bin/python3.11",
        "filename": "cpython-3.11.17+20261003-x86_64-unknown-linux-gnu-install_only.tar.gz"
      },
      "wheels": [
        {
          "sha256": "3e2091cd341423207e2f084a6654b1efcd250dc326f2a37d6dde446e07cabb11",
          "destination": "accelerate-1.12.0-py3-none-any.whl",
          "filename": "accelerate-1.12.0-py3-none-any.whl"
        },
        {
          "sha256": "117bac03a25ede5df5440e855b32d556049ca169ead221505badf432fed4b101",
          "destination": "annotated_doc-0.0.5-py3-none-any.whl",
          "filename": "annotated_doc-0.0.5-py3-none-any.whl"
        },
        {
          "sha256": "f072f4d804ea359e4eaf198b1af7a8b0943881a87f31bb764f8bf219bb9419e0",
          "destination": "annotated_types-0.8.0-py3-none-any.whl",
          "filename": "annotated_types-0.8.0-py3-none-any.whl"
        },
        {
          "sha256": "6152fdbbf9a77fdec97731721bebf7c4c44f7c29b424b0065826173efc7ed101",
          "destination": "anyio-4.15.1-py3-none-any.whl",
          "filename": "anyio-4.15.1-py3-none-any.whl"
        },
        {
          "sha256": "b30d1df6c5d3de5dcef0fb0e256f6ea17bdcf5f979408df0297d8a408e2971b4",
          "destination": "audioread-3.1.0-py3-none-any.whl",
          "filename": "audioread-3.1.0-py3-none-any.whl"
        },
        {
          "sha256": "8a032e8d8ebc73dec079364b9b4a6837638a2d106e8472314e685ffbf163e700",
          "destination": "av-18.1.0-cp311-abi3-manylinux_2_28_x86_64.whl",
          "filename": "av-18.1.0-cp311-abi3-manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "ba0efaa9080b619ff2f3459d1d500c57bddea4a6b424b60a91141db6fd2f08bc",
          "destination": "blinker-1.9.0-py3-none-any.whl",
          "filename": "blinker-1.9.0-py3-none-any.whl"
        },
        {
          "sha256": "40d918bce2b427a0c4ba189df7a006ac0c7277c180aee4617d99e9ccaaf59e6a",
          "destination": "brotli-1.2.0-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
          "filename": "brotli-1.2.0-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
        },
        {
          "sha256": "62f22742b58a1a33014a2b6b706588a8d7e2a88ae7bd1a6ebe8c992928483775",
          "destination": "certifi-2026.7.22-py3-none-any.whl",
          "filename": "certifi-2026.7.22-py3-none-any.whl"
        },
        {
          "sha256": "34e261f78cb6ceaaa36f42f2613f4380d94d9c759a9c73c769ee6e0247364632",
          "destination": "cffi-2.1.1-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
          "filename": "cffi-2.1.1-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
        },
        {
          "sha256": "211d5a3eb6af8f513b8d4ca19a8c1b7accab1b5f0d3175f9826b03c1a920dc1f",
          "destination": "charset_normalizer-3.5.2-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "charset_normalizer-3.5.2-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "255bc9599cf7748b4b1a446ccc735421bd08a2ae529a8b88597d3de5664ee360",
          "destination": "click-8.5.0-py3-none-any.whl",
          "filename": "click-8.5.0-py3-none-any.whl"
        },
        {
          "sha256": "9acb47f6afd73f60dc1df93bb801b472f05ff42fa6c84167d25cb206be1fbf4a",
          "destination": "cloudpickle-3.1.2-py3-none-any.whl",
          "filename": "cloudpickle-3.1.2-py3-none-any.whl"
        },
        {
          "sha256": "4f1d9991f5acc0ca119f9d443620b77f9d6b33703e51011c16baf57afb285fc6",
          "destination": "colorama-0.4.6-py2.py3-none-any.whl",
          "filename": "colorama-0.4.6-py2.py3-none-any.whl"
        },
        {
          "sha256": "e6035b5231a9316edc19d6415f4296fd1d0370e2a165a714b3edc167b9ca00e1",
          "destination": "cython-3.3.0-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "cython-3.3.0-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "f47fe6fdbd2edd623ecfe36875d37aba411624e2670dd395dddae1358689bb3c",
          "destination": "decorator-5.3.1-py3-none-any.whl",
          "filename": "decorator-5.3.1-py3-none-any.whl"
        },
        {
          "sha256": "8963383d935e802941c8f9d778403798452e172150c3b4b5dee288d50b62ecc8",
          "destination": "dyNET38-2.2-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
          "filename": "dyNET38-2.2-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl"
        },
        {
          "sha256": "bd5f4d81f1e93a88bcd77caf4dfe3c2dbffc3805407a0007e9a114c18b3a670b",
          "destination": "fastapi-0.142.2-py3-none-any.whl",
          "filename": "fastapi-0.142.2-py3-none-any.whl"
        },
        {
          "sha256": "5f17ee83ecee8a6f3e389c75822fb70a1c2f0506b99438a6dffa1d56793588c8",
          "destination": "filelock-4.0.12-py3-none-any.whl",
          "filename": "filelock-4.0.12-py3-none-any.whl"
        },
        {
          "sha256": "f4bcbefc124291925f1a26446da31a5178f9483862233b23c0c96a20701f670c",
          "destination": "flask-3.1.3-py3-none-any.whl",
          "filename": "flask-3.1.3-py3-none-any.whl"
        },
        {
          "sha256": "8dd6e646e99ea382bd85f97a45e6b526a442d79423a7dc673f1e2756d05fcb5f",
          "destination": "fsspec-2026.9.0-py3-none-any.whl",
          "filename": "fsspec-2026.9.0-py3-none-any.whl"
        },
        {
          "sha256": "7e52c65bfbb7bd75ac1c28cb38f93b01e5f6a2ff013224e6213533451bfee517",
          "destination": "gradio-6.17.3-py3-none-any.whl",
          "filename": "gradio-6.17.3-py3-none-any.whl"
        },
        {
          "sha256": "d43e2179c29076292a76485ad7ed2e6eaa19d14ac58283bd7f5beabfe4ca958c",
          "destination": "gradio_client-2.5.0-py3-none-any.whl",
          "filename": "gradio_client-2.5.0-py3-none-any.whl"
        },
        {
          "sha256": "7f7975bab18c729a257a8b1ae9dcd70b7cafb1720481beae47719af57c35fa64",
          "destination": "groovy-0.1.2-py3-none-any.whl",
          "filename": "groovy-0.1.2-py3-none-any.whl"
        },
        {
          "sha256": "63cf8bbe7522de3bf65932fda1d9c2772064ffb3dae62d55932da54b31cb6c86",
          "destination": "h11-0.16.0-py3-none-any.whl",
          "filename": "h11-0.16.0-py3-none-any.whl"
        },
        {
          "sha256": "76b8cb8be6abe62d74c1ad2d35b42f0629db89aa9e1a8d033cecfe7c856eeab3",
          "destination": "hf_gradio-0.4.1-py3-none-any.whl",
          "filename": "hf_gradio-0.4.1-py3-none-any.whl"
        },
        {
          "sha256": "d62671bb130879cef0ee4c9ebe47a14af6c66ec53e6d84dc15936e5ffdfac82f",
          "destination": "hf_xet-1.6.0-cp38-abi3-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
          "filename": "hf_xet-1.6.0-cp38-abi3-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
        },
        {
          "sha256": "2d400746a40668fc9dec9810239072b40b4484b640a8c38fd654a024c7a1bf55",
          "destination": "httpcore-1.0.9-py3-none-any.whl",
          "filename": "httpcore-1.0.9-py3-none-any.whl"
        },
        {
          "sha256": "d909fcccc110f8c7faf814ca82a9a4d816bc5a6dbfea25d6591d6985b8ba59ad",
          "destination": "httpx-0.28.1-py3-none-any.whl",
          "filename": "httpx-0.28.1-py3-none-any.whl"
        },
        {
          "sha256": "48f0c8eac16145dfce371e9d2d7772854a4f591bcb56c9cf548accf531d54270",
          "destination": "huggingface_hub-0.36.2-py3-none-any.whl",
          "filename": "huggingface_hub-0.36.2-py3-none-any.whl"
        },
        {
          "sha256": "ab7ae7122974553370f0bdb919e1a960b2cd1bc1ef0276416d896db81c14582c",
          "destination": "idna-3.20-py3-none-any.whl",
          "filename": "idna-3.20-py3-none-any.whl"
        },
        {
          "sha256": "c6242fc49e35958c8b15141343aa660db5fc54d4f13a1db01a3f5891b98700ef",
          "destination": "itsdangerous-2.2.0-py3-none-any.whl",
          "filename": "itsdangerous-2.2.0-py3-none-any.whl"
        },
        {
          "sha256": "85ece4451f492d0c13c5dd7c13a64681a86afae63a5f347908daf103ce6d2f67",
          "destination": "jinja2-3.1.6-py3-none-any.whl",
          "filename": "jinja2-3.1.6-py3-none-any.whl"
        },
        {
          "sha256": "3dbbf9f6e4b592a2357b854608e980fe6390d131d7a82f011a377ef2ebef7aba",
          "destination": "joblib-1.6.0-py3-none-any.whl",
          "filename": "joblib-1.6.0-py3-none-any.whl"
        },
        {
          "sha256": "77253be3391b06124a0e16105bd663b6c54470af1a9ca8e1cf026f38d58ed056",
          "destination": "lazy_loader-0.6-py3-none-any.whl",
          "filename": "lazy_loader-0.6-py3-none-any.whl"
        },
        {
          "sha256": "0b6415c4fd68bff4c29288abe67c6d80b587e0e1e2cfb0aad23e4559504a7fa1",
          "destination": "librosa-0.11.0-py3-none-any.whl",
          "filename": "librosa-0.11.0-py3-none-any.whl"
        },
        {
          "sha256": "a6ffde00d4be8772a24e3e8b3af6bf86a79e7cf066d944ef56136b3957d707dc",
          "destination": "llvmlite-0.50.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "llvmlite-0.50.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "9f7ebbcd14fe59494226453aed97c1070d83f8d24b6fc3a3bcf9a38092641c4a",
          "destination": "markdown_it_py-4.2.0-py3-none-any.whl",
          "filename": "markdown_it_py-4.2.0-py3-none-any.whl"
        },
        {
          "sha256": "6da83a088f8ef93b2d483a8232a4dbf4d69d3d8496b568a03c56becac43e1808",
          "destination": "markupsafe-3.0.4-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "markupsafe-3.0.4-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "84008a41e51615a49fc9966191ff91509e3c40b939176e643fd50a5c2196b8f8",
          "destination": "mdurl-0.1.2-py3-none-any.whl",
          "filename": "mdurl-0.1.2-py3-none-any.whl"
        },
        {
          "sha256": "a0b2b9fe80bbcd81a6647ff13108738cfb482d481d826cc0e02f5b35e5c88d2c",
          "destination": "mpmath-1.3.0-py3-none-any.whl",
          "filename": "mpmath-1.3.0-py3-none-any.whl"
        },
        {
          "sha256": "382b219de3d436de3baba0f4b0c6d4336e8f5858d0eb047918b13b69a71c6c55",
          "destination": "msgpack-1.2.3-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "msgpack-1.2.3-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "70d715680e33c48a8066a8588a52149d98644cddae1b5127cc5660c6418c81ce",
          "destination": "nagisa-0.2.11-cp311-cp311-manylinux_2_5_x86_64.manylinux1_x86_64.manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
          "filename": "nagisa-0.2.11-cp311-cp311-manylinux_2_5_x86_64.manylinux1_x86_64.manylinux_2_17_x86_64.manylinux2014_x86_64.whl"
        },
        {
          "sha256": "29326d74f107c347fd1009bd58e38d9f7c7c5b51e6de97bc93dbc325d9038b54",
          "destination": "narwhals-2.26.0-py3-none-any.whl",
          "filename": "narwhals-2.26.0-py3-none-any.whl"
        },
        {
          "sha256": "d47fbf302e7d9cbbb9e2555a0d267983d2aa476bac30e90dfbe5669bd57f3762",
          "destination": "networkx-3.6.1-py3-none-any.whl",
          "filename": "networkx-3.6.1-py3-none-any.whl"
        },
        {
          "sha256": "68f92839637a2aaca8ae124c3abf91f648d2fade50953ea8e81ec604ac05a771",
          "destination": "numba-0.68.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "numba-0.68.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "ba10f8411898fc418a521833e014a77d3ca01c15b0c6cdcce6a0d2897e6dbbdf",
          "destination": "numpy-2.2.6-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
          "filename": "numpy-2.2.6-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl"
        },
        {
          "sha256": "8ac4e771d5a348c551b2a426eda6193c19aa630236b418086020df5ba9667142",
          "destination": "nvidia_cublas_cu12-12.8.4.1-py3-none-manylinux_2_27_x86_64.whl",
          "filename": "nvidia_cublas_cu12-12.8.4.1-py3-none-manylinux_2_27_x86_64.whl"
        },
        {
          "sha256": "ea0cb07ebda26bb9b29ba82cda34849e73c166c18162d3913575b0c9db9a6182",
          "destination": "nvidia_cuda_cupti_cu12-12.8.90-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
          "filename": "nvidia_cuda_cupti_cu12-12.8.90-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
        },
        {
          "sha256": "a7756528852ef889772a84c6cd89d41dfa74667e24cca16bb31f8f061e3e9994",
          "destination": "nvidia_cuda_nvrtc_cu12-12.8.93-py3-none-manylinux2010_x86_64.manylinux_2_12_x86_64.whl",
          "filename": "nvidia_cuda_nvrtc_cu12-12.8.93-py3-none-manylinux2010_x86_64.manylinux_2_12_x86_64.whl"
        },
        {
          "sha256": "adade8dcbd0edf427b7204d480d6066d33902cab2a4707dcfc48a2d0fd44ab90",
          "destination": "nvidia_cuda_runtime_cu12-12.8.90-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
          "filename": "nvidia_cuda_runtime_cu12-12.8.90-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
        },
        {
          "sha256": "949452be657fa16687d0930933f032835951ef0892b37d2d53824d1a84dc97a8",
          "destination": "nvidia_cudnn_cu12-9.10.2.21-py3-none-manylinux_2_27_x86_64.whl",
          "filename": "nvidia_cudnn_cu12-9.10.2.21-py3-none-manylinux_2_27_x86_64.whl"
        },
        {
          "sha256": "4d2dd21ec0b88cf61b62e6b43564355e5222e4a3fb394cac0db101f2dd0d4f74",
          "destination": "nvidia_cufft_cu12-11.3.3.83-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
          "filename": "nvidia_cufft_cu12-11.3.3.83-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
        },
        {
          "sha256": "1d069003be650e131b21c932ec3d8969c1715379251f8d23a1860554b1cb24fc",
          "destination": "nvidia_cufile_cu12-1.13.1.3-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
          "filename": "nvidia_cufile_cu12-1.13.1.3-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
        },
        {
          "sha256": "b32331d4f4df5d6eefa0554c565b626c7216f87a06a4f56fab27c3b68a830ec9",
          "destination": "nvidia_curand_cu12-10.3.9.90-py3-none-manylinux_2_27_x86_64.whl",
          "filename": "nvidia_curand_cu12-10.3.9.90-py3-none-manylinux_2_27_x86_64.whl"
        },
        {
          "sha256": "4376c11ad263152bd50ea295c05370360776f8c3427b30991df774f9fb26c450",
          "destination": "nvidia_cusolver_cu12-11.7.3.90-py3-none-manylinux_2_27_x86_64.whl",
          "filename": "nvidia_cusolver_cu12-11.7.3.90-py3-none-manylinux_2_27_x86_64.whl"
        },
        {
          "sha256": "f1bb701d6b930d5a7cea44c19ceb973311500847f81b634d802b7b539dc55623",
          "destination": "nvidia_cusparselt_cu12-0.7.1-py3-none-manylinux2014_x86_64.whl",
          "filename": "nvidia_cusparselt_cu12-0.7.1-py3-none-manylinux2014_x86_64.whl"
        },
        {
          "sha256": "1ec05d76bbbd8b61b06a80e1eaf8cf4959c3d4ce8e711b65ebd0443bb0ebb13b",
          "destination": "nvidia_cusparse_cu12-12.5.8.93-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
          "filename": "nvidia_cusparse_cu12-12.5.8.93-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
        },
        {
          "sha256": "adf27ccf4238253e0b826bce3ff5fa532d65fc42322c8bfdfaf28024c0fbe039",
          "destination": "nvidia_nccl_cu12-2.27.3-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
          "filename": "nvidia_nccl_cu12-2.27.3-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
        },
        {
          "sha256": "81ff63371a7ebd6e6451970684f916be2eab07321b73c9d244dc2b4da7f73b88",
          "destination": "nvidia_nvjitlink_cu12-12.8.93-py3-none-manylinux2010_x86_64.manylinux_2_12_x86_64.whl",
          "filename": "nvidia_nvjitlink_cu12-12.8.93-py3-none-manylinux2010_x86_64.manylinux_2_12_x86_64.whl"
        },
        {
          "sha256": "5b17e2001cc0d751a5bc2c6ec6d26ad95913324a4adb86788c944f8ce9ba441f",
          "destination": "nvidia_nvtx_cu12-12.8.90-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
          "filename": "nvidia_nvtx_cu12-12.8.90-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
        },
        {
          "sha256": "80e068aba7cd56c8b58512d6a36f8d25cb1dfaa0c0a4cc1c938ccf9f362d9cb3",
          "destination": "opentelemetry_api-1.45.0-py3-none-any.whl",
          "filename": "opentelemetry_api-1.45.0-py3-none-any.whl"
        },
        {
          "sha256": "9caf3d09f47c3c70c4451ada20ef9bc4a4cdffa26f49862cf0a253b329aae2d5",
          "destination": "orjson-3.12.0-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
          "filename": "orjson-3.12.0-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl"
        },
        {
          "sha256": "d7193f7c8e4e93f444fde0262bf90af30e16fa0ad0ad44cb553c87339b23cd1c",
          "destination": "packaging-26.3-py3-none-any.whl",
          "filename": "packaging-26.3-py3-none-any.whl"
        },
        {
          "sha256": "47121f9571503f724c9b93e297ab6254ac99c77adf5e9ed085ea419fd585c258",
          "destination": "pandas-3.0.6-cp311-cp311-manylinux_2_24_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "pandas-3.0.6-cp311-cp311-manylinux_2_24_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "23d27a3e0307ec2244cc51e7287b919aa68d097504ebe19df4e76a98a3eea5bd",
          "destination": "pillow-12.3.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "pillow-12.3.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "6d67a2b4e7f14d8b31b8b52648866fa717f45a1eb70e83002f4331d07e953717",
          "destination": "pip-25.2-py3-none-any.whl",
          "filename": "pip-25.2-py3-none-any.whl"
        },
        {
          "sha256": "080f3b39423b5abfca9a23d84c4e9795f54d395cd8459867a8ded44084fcd5f8",
          "destination": "platformdirs-4.12.3-py3-none-any.whl",
          "filename": "platformdirs-4.12.3-py3-none-any.whl"
        },
        {
          "sha256": "f265597baa9f760d25ceb29d0beb8186c243d6607b0f60b83ecf14078dbc703b",
          "destination": "pooch-1.9.0-py3-none-any.whl",
          "filename": "pooch-1.9.0-py3-none-any.whl"
        },
        {
          "sha256": "076a2d2f923fd4821644f5ba89f059523da90dc9014e85f8e45a5774ca5bc6f9",
          "destination": "psutil-7.2.2-cp36-abi3-manylinux2010_x86_64.manylinux_2_12_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "psutil-7.2.2-cp36-abi3-manylinux2010_x86_64.manylinux_2_12_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "b727414169a36b7d524c1c3e31839a521725078d7b2ff038656844266160a992",
          "destination": "pycparser-3.0-py3-none-any.whl",
          "filename": "pycparser-3.0-py3-none-any.whl"
        },
        {
          "sha256": "346a034f080da3755d8e9cb5e00e8b07de1d39e4f6e2c87d8ab7cafa0b269a73",
          "destination": "pydantic-2.13.5-py3-none-any.whl",
          "filename": "pydantic-2.13.5-py3-none-any.whl"
        },
        {
          "sha256": "49776eab08766a08dfff7012f8b422dcd7e25e43b316eedf0477c24fcfa84b7c",
          "destination": "pydantic_core-2.46.5-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
          "filename": "pydantic_core-2.46.5-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl"
        },
        {
          "sha256": "65617e33033874b59d87db603aa1ed450633288aefead953b30bded59cb599a6",
          "destination": "pydub-0.25.1-py2.py3-none-any.whl",
          "filename": "pydub-0.25.1-py2.py3-none-any.whl"
        },
        {
          "sha256": "2363c69b61c4a97c838da3b130dcd6468f4848992b21a82f2a63ec34377137d9",
          "destination": "pygments-2.21.0-py3-none-any.whl",
          "filename": "pygments-2.21.0-py3-none-any.whl"
        },
        {
          "sha256": "a8b2bc7bffae282281c8140a97d3aa9c14da0b136dfe83f850eea9a5f7470427",
          "destination": "python_dateutil-2.9.0.post0-py2.py3-none-any.whl",
          "filename": "python_dateutil-2.9.0.post0-py2.py3-none-any.whl"
        },
        {
          "sha256": "ff6d3f776f16878c894e52e107296ffc890e913c611b1a4ec6c44e2821fe2e23",
          "destination": "python_multipart-0.0.32-py3-none-any.whl",
          "filename": "python_multipart-0.0.32-py3-none-any.whl"
        },
        {
          "sha256": "e658af3757f9e26a9d25dd2aff38335acd92bc9104f890a894b2c1ba28311b03",
          "destination": "pytz-2026.5-py2.py3-none-any.whl",
          "filename": "pytz-2026.5-py2.py3-none-any.whl"
        },
        {
          "sha256": "b8bb0864c5a28024fac8a632c443c87c5aa6f215c0b126c449ae1a150412f31d",
          "destination": "pyyaml-6.0.3-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "pyyaml-6.0.3-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "b9c55a38413298f3a990a4475467399daec6e8f4172363053fc42e2166c2dfd3",
          "destination": "qwen_asr-0.0.6-py3-none-any.whl",
          "filename": "qwen_asr-0.0.6-py3-none-any.whl"
        },
        {
          "sha256": "f111db07af669c83333411c5177131e18e831fe666d6a55a1af263952ada8939",
          "destination": "qwen_omni_utils-0.0.9-py3-none-any.whl",
          "filename": "qwen_omni_utils-0.0.9-py3-none-any.whl"
        },
        {
          "sha256": "612b709381c0355b70d89cdb51b7f670591ed5cbbc0e3b5337488019dc667b65",
          "destination": "regex-2026.9.29-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "regex-2026.9.29-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "2a0d60c172f83ac6ab31e4554906c0f3b3588d37b5cb939b1c061f4907e278e0",
          "destination": "requests-2.34.2-py3-none-any.whl",
          "filename": "requests-2.34.2-py3-none-any.whl"
        },
        {
          "sha256": "33bd4ef74232fb73fe9279a257718407f169c09b78a87ad3d296f548e27de0bb",
          "destination": "rich-15.0.0-py3-none-any.whl",
          "filename": "rich-15.0.0-py3-none-any.whl"
        },
        {
          "sha256": "c4f4a162db6993464d7ca3d7cc4af0ffc6515a606dfd220b9f82c6945d869cde",
          "destination": "safehttpx-0.1.7-py3-none-any.whl",
          "filename": "safehttpx-0.1.7-py3-none-any.whl"
        },
        {
          "sha256": "fd6f3f93c9a0a7cc2788ee63fb763353d4bd2e89b0751bc78fcf7dda00bea774",
          "destination": "safetensors-0.8.0-cp310-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
          "filename": "safetensors-0.8.0-cp310-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl"
        },
        {
          "sha256": "52a0703bbc07ad27f560fa63fa68e4c54dd735bfbbf65b4dd3c225dc7547b6df",
          "destination": "scikit_learn-1.9.1-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "scikit_learn-1.9.1-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "43af8d1f3bea642559019edfe64e9b11192a8978efbd1539d7bc2aaa23d92de4",
          "destination": "scipy-1.17.1-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "scipy-1.17.1-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "de78a3b8e0feda74cabc54aab2da702113e33ac9d9eb9d2389bcf1f58b7d9177",
          "destination": "semantic_version-2.10.0-py2.py3-none-any.whl",
          "filename": "semantic_version-2.10.0-py2.py3-none-any.whl"
        },
        {
          "sha256": "51a52592b3b99e102b609654876bd65f19f999935166d1352678931132b0c670",
          "destination": "setuptools-84.0.0-py3-none-any.whl",
          "filename": "setuptools-84.0.0-py3-none-any.whl"
        },
        {
          "sha256": "7ecfff8f2fd72616f7481040475a65b2bf8af90a56c89140852d1120324e8686",
          "destination": "shellingham-1.5.4-py2.py3-none-any.whl",
          "filename": "shellingham-1.5.4-py2.py3-none-any.whl"
        },
        {
          "sha256": "94fd1476b56ed36b851da8db9bd5144e92f669007ad54e0d8094913e4fbf1418",
          "destination": "sherpa_onnx-1.13.8-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
          "filename": "sherpa_onnx-1.13.8-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
        },
        {
          "sha256": "4da90acf435373d7b2ba9cc0be806e7e274d28f63f5780880b5dea6721626e36",
          "destination": "sherpa_onnx_core-1.13.8-py3-none-manylinux2014_x86_64.whl",
          "filename": "sherpa_onnx_core-1.13.8-py3-none-manylinux2014_x86_64.whl"
        },
        {
          "sha256": "4721f391ed90541fddacab5acf947aa0d3dc7d27b2e1e8eda2be8970586c3274",
          "destination": "six-1.17.0-py2.py3-none-any.whl",
          "filename": "six-1.17.0-py2.py3-none-any.whl"
        },
        {
          "sha256": "1e38bac1853412871318e82a1ba69a8be677619b56025bbfcccdb41b6cafe82d",
          "destination": "soundfile-0.14.0-py2.py3-none-manylinux_2_28_x86_64.whl",
          "filename": "soundfile-0.14.0-py2.py3-none-manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "54a4a89ab8b6153cbf61ed6297ac836face23d8664a6efefc557a22ed448bc6f",
          "destination": "sox-1.5.0-py3-none-any.whl",
          "filename": "sox-1.5.0-py3-none-any.whl"
        },
        {
          "sha256": "3da87e3ffa3e41823d873b051c7ecb2acebd8d1b6b46b752f5facf10a0d84ab9",
          "destination": "soxr-1.1.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "soxr-1.1.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "2aed0ced1f0f74f7bdd0bdc24a979c5cb9ee4a28393642db52a83d174ed65b7a",
          "destination": "soynlp-0.0.493-py3-none-any.whl",
          "filename": "soynlp-0.0.493-py3-none-any.whl"
        },
        {
          "sha256": "67f8e99895493dd2911a03f11314af6ceebeae4e704bb9f43dfc6a9db151c93e",
          "destination": "starlette-1.7.0-py3-none-any.whl",
          "filename": "starlette-1.7.0-py3-none-any.whl"
        },
        {
          "sha256": "e091cc3e99d2141a0ba2847328f5479b05d94a6635cb96148ccb3f34671bd8f5",
          "destination": "sympy-1.14.0-py3-none-any.whl",
          "filename": "sympy-1.14.0-py3-none-any.whl"
        },
        {
          "sha256": "cd8b60b5641b45c67bbf73c64c843235fc2d8a480c87389f52f5dbee893b86be",
          "destination": "threadpoolctl-3.7.0-py3-none-any.whl",
          "filename": "threadpoolctl-3.7.0-py3-none-any.whl"
        },
        {
          "sha256": "369cc9fc8cc10cb24143873a0d95438bb8ee257bb80c71989e3ee290e8d72c67",
          "destination": "tokenizers-0.22.2-cp39-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
          "filename": "tokenizers-0.22.2-cp39-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl"
        },
        {
          "sha256": "592064ed85b40fa213469f81ac584f67a4f2992509a7c3ea2d632208623a3680",
          "destination": "tomlkit-0.14.0-py3-none-any.whl",
          "filename": "tomlkit-0.14.0-py3-none-any.whl"
        },
        {
          "sha256": "039b9dcdd6bdbaa10a8a5cd6be22c4cb3e3589a341e5f904cbb571ca28f55bed",
          "destination": "torch-2.8.0+cu128-cp311-cp311-manylinux_2_28_x86_64.whl",
          "filename": "torch-2.8.0+cu128-cp311-cp311-manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "c293e525e6fef9c20e8728fd4612df02a0aa31bb5fe91ecd93e123b1b7bffa73",
          "destination": "tqdm-4.70.1-py3-none-any.whl",
          "filename": "tqdm-4.70.1-py3-none-any.whl"
        },
        {
          "sha256": "4c9e9de11333ddfe5114bc872c9f370509198acf0b87a832a0ab9458e2bd0550",
          "destination": "transformers-4.57.6-py3-none-any.whl",
          "filename": "transformers-4.57.6-py3-none-any.whl"
        },
        {
          "sha256": "7b70f5e6a41e52e48cfc087436c8a28c17ff98db369447bcaff3b887a3ab4467",
          "destination": "triton-3.4.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl",
          "filename": "triton-3.4.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl"
        },
        {
          "sha256": "b3a5fc4342d5fc8fda8fc3010b1cf117e9249aab7fae800c2eff62fd3842d97d",
          "destination": "typer-0.27.2-py3-none-any.whl",
          "filename": "typer-0.27.2-py3-none-any.whl"
        },
        {
          "sha256": "481caa481374e813c1b176ada14e97f1f67a4539ce9cfeb3f350d78d6370c2e8",
          "destination": "typing_extensions-4.16.0-py3-none-any.whl",
          "filename": "typing_extensions-4.16.0-py3-none-any.whl"
        },
        {
          "sha256": "65b8397ba37ccbce054456aaccddfc91e6e3083c92824df348d96ca832f3f147",
          "destination": "typing_inspection-0.4.4-py3-none-any.whl",
          "filename": "typing_inspection-0.4.4-py3-none-any.whl"
        },
        {
          "sha256": "b683bd1b6659ddcd810ff02ad09ba821d4bf1065072805063eb35c49617905ac",
          "destination": "tzdata-2026.5-py2.py3-none-any.whl",
          "filename": "tzdata-2026.5-py2.py3-none-any.whl"
        },
        {
          "sha256": "0cf3cae568d36aa9576b28dfb35f11328f1cb974ca7647d9475ebb86c75ac6e3",
          "destination": "urllib3-2.8.0-py3-none-any.whl",
          "filename": "urllib3-2.8.0-py3-none-any.whl"
        },
        {
          "sha256": "505bdb0f318731d45f1f712071fc781a8981f6847a31c902c9f5e652d4f67faf",
          "destination": "uvicorn-0.54.0-py3-none-any.whl",
          "filename": "uvicorn-0.54.0-py3-none-any.whl"
        },
        {
          "sha256": "6392e50c78460ba618e5b21f08a71f59c99ce99cdc6cf6e3dd7e6ccca8754fab",
          "destination": "werkzeug-3.1.9-py3-none-any.whl",
          "filename": "werkzeug-3.1.9-py3-none-any.whl"
        }
      ],
      "packages": [
        "sherpa-onnx==1.13.8",
        "numpy==2.2.6",
        "torch==2.8.0+cu128",
        "qwen-asr==0.0.6",
        "huggingface-hub>=0.30"
      ],
      "dependenciesVerified": true,
      "enabled": true,
      "platformVerified": true
    },
    {
      "id": "linux-arm64-onnx-cpu",
      "version": "1",
      "platform": "linux",
      "arch": "arm64",
      "engine": "onnx",
      "accelerator": "cpu",
      "python": {
        "sha256": "2238f0556d3a9777d42261b1e4d7b9834d56f111d3dd879a0647c27c824cc31d",
        "format": "tar.gz",
        "destination": "cpython-3.11.17+20261003-aarch64-unknown-linux-gnu-install_only.tar.gz",
        "executable": "python/bin/python3.11",
        "filename": "cpython-3.11.17+20261003-aarch64-unknown-linux-gnu-install_only.tar.gz"
      },
      "wheels": [
        {
          "sha256": "b64d8d4d17135e00c8e346e0a738deb17e754230d7e0810ac5012750bbd85a5a",
          "destination": "numpy-2.2.6-cp311-cp311-manylinux_2_17_aarch64.manylinux2014_aarch64.whl",
          "filename": "numpy-2.2.6-cp311-cp311-manylinux_2_17_aarch64.manylinux2014_aarch64.whl"
        },
        {
          "sha256": "6d67a2b4e7f14d8b31b8b52648866fa717f45a1eb70e83002f4331d07e953717",
          "destination": "pip-25.2-py3-none-any.whl",
          "filename": "pip-25.2-py3-none-any.whl"
        },
        {
          "sha256": "b56808d19a79368dcaa507d02a4c1ce537ca713fab9fedd91256b4ec599c6bf7",
          "destination": "sherpa_onnx-1.13.8-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.whl",
          "filename": "sherpa_onnx-1.13.8-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.whl"
        },
        {
          "sha256": "a51a03d55c376c32e15dd63ea852236042ba91a5cd73e253bbf7cf21f6582ba9",
          "destination": "sherpa_onnx_core-1.13.8-py3-none-manylinux2014_aarch64.whl",
          "filename": "sherpa_onnx_core-1.13.8-py3-none-manylinux2014_aarch64.whl"
        }
      ],
      "packages": [
        "sherpa-onnx==1.13.8",
        "numpy==2.2.6"
      ],
      "dependenciesVerified": true,
      "enabled": true,
      "platformVerified": true
    },
    {
      "id": "linux-arm64-transformers-cpu",
      "version": "1",
      "platform": "linux",
      "arch": "arm64",
      "engine": "transformers",
      "accelerator": "cpu",
      "python": {
        "sha256": "2238f0556d3a9777d42261b1e4d7b9834d56f111d3dd879a0647c27c824cc31d",
        "format": "tar.gz",
        "destination": "cpython-3.11.17+20261003-aarch64-unknown-linux-gnu-install_only.tar.gz",
        "executable": "python/bin/python3.11",
        "filename": "cpython-3.11.17+20261003-aarch64-unknown-linux-gnu-install_only.tar.gz"
      },
      "wheels": [
        {
          "sha256": "3e2091cd341423207e2f084a6654b1efcd250dc326f2a37d6dde446e07cabb11",
          "destination": "accelerate-1.12.0-py3-none-any.whl",
          "filename": "accelerate-1.12.0-py3-none-any.whl"
        },
        {
          "sha256": "117bac03a25ede5df5440e855b32d556049ca169ead221505badf432fed4b101",
          "destination": "annotated_doc-0.0.5-py3-none-any.whl",
          "filename": "annotated_doc-0.0.5-py3-none-any.whl"
        },
        {
          "sha256": "f072f4d804ea359e4eaf198b1af7a8b0943881a87f31bb764f8bf219bb9419e0",
          "destination": "annotated_types-0.8.0-py3-none-any.whl",
          "filename": "annotated_types-0.8.0-py3-none-any.whl"
        },
        {
          "sha256": "6152fdbbf9a77fdec97731721bebf7c4c44f7c29b424b0065826173efc7ed101",
          "destination": "anyio-4.15.1-py3-none-any.whl",
          "filename": "anyio-4.15.1-py3-none-any.whl"
        },
        {
          "sha256": "b30d1df6c5d3de5dcef0fb0e256f6ea17bdcf5f979408df0297d8a408e2971b4",
          "destination": "audioread-3.1.0-py3-none-any.whl",
          "filename": "audioread-3.1.0-py3-none-any.whl"
        },
        {
          "sha256": "6fc837cc51adf80331ac850779cd53b5d4c4460b0ebe9057a02a921c6736f19d",
          "destination": "av-18.1.0-cp311-abi3-manylinux_2_28_aarch64.whl",
          "filename": "av-18.1.0-cp311-abi3-manylinux_2_28_aarch64.whl"
        },
        {
          "sha256": "ba0efaa9080b619ff2f3459d1d500c57bddea4a6b424b60a91141db6fd2f08bc",
          "destination": "blinker-1.9.0-py3-none-any.whl",
          "filename": "blinker-1.9.0-py3-none-any.whl"
        },
        {
          "sha256": "350c8348f0e76fff0a0fd6c26755d2653863279d086d3aa2c290a6a7251135dd",
          "destination": "brotli-1.2.0-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl",
          "filename": "brotli-1.2.0-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl"
        },
        {
          "sha256": "62f22742b58a1a33014a2b6b706588a8d7e2a88ae7bd1a6ebe8c992928483775",
          "destination": "certifi-2026.7.22-py3-none-any.whl",
          "filename": "certifi-2026.7.22-py3-none-any.whl"
        },
        {
          "sha256": "3311ed60d36f83378794e1009ac6258bafbf81f7888b4caa7b35a521e3f95813",
          "destination": "cffi-2.1.1-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.whl",
          "filename": "cffi-2.1.1-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.whl"
        },
        {
          "sha256": "d760fe2a4d7c3b226cb9026d6a842868d52a7901bd98420e1baf14e80da85cf5",
          "destination": "charset_normalizer-3.5.2-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl",
          "filename": "charset_normalizer-3.5.2-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl"
        },
        {
          "sha256": "255bc9599cf7748b4b1a446ccc735421bd08a2ae529a8b88597d3de5664ee360",
          "destination": "click-8.5.0-py3-none-any.whl",
          "filename": "click-8.5.0-py3-none-any.whl"
        },
        {
          "sha256": "9acb47f6afd73f60dc1df93bb801b472f05ff42fa6c84167d25cb206be1fbf4a",
          "destination": "cloudpickle-3.1.2-py3-none-any.whl",
          "filename": "cloudpickle-3.1.2-py3-none-any.whl"
        },
        {
          "sha256": "4f1d9991f5acc0ca119f9d443620b77f9d6b33703e51011c16baf57afb285fc6",
          "destination": "colorama-0.4.6-py2.py3-none-any.whl",
          "filename": "colorama-0.4.6-py2.py3-none-any.whl"
        },
        {
          "sha256": "11e437f086affee8051cec4bb531be3edb646ab66e325154aa6849377f365033",
          "destination": "cython-3.3.0-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl",
          "filename": "cython-3.3.0-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl"
        },
        {
          "sha256": "f47fe6fdbd2edd623ecfe36875d37aba411624e2670dd395dddae1358689bb3c",
          "destination": "decorator-5.3.1-py3-none-any.whl",
          "filename": "decorator-5.3.1-py3-none-any.whl"
        },
        {
          "sha256": "313799701f7e44cbfaff98a88f1373beef9be57aa340e7e986238673de7d9173",
          "destination": "dyNET38-2.2-cp311-cp311-manylinux_2_17_aarch64.manylinux2014_aarch64.whl",
          "filename": "dyNET38-2.2-cp311-cp311-manylinux_2_17_aarch64.manylinux2014_aarch64.whl"
        },
        {
          "sha256": "bd5f4d81f1e93a88bcd77caf4dfe3c2dbffc3805407a0007e9a114c18b3a670b",
          "destination": "fastapi-0.142.2-py3-none-any.whl",
          "filename": "fastapi-0.142.2-py3-none-any.whl"
        },
        {
          "sha256": "5f17ee83ecee8a6f3e389c75822fb70a1c2f0506b99438a6dffa1d56793588c8",
          "destination": "filelock-4.0.12-py3-none-any.whl",
          "filename": "filelock-4.0.12-py3-none-any.whl"
        },
        {
          "sha256": "f4bcbefc124291925f1a26446da31a5178f9483862233b23c0c96a20701f670c",
          "destination": "flask-3.1.3-py3-none-any.whl",
          "filename": "flask-3.1.3-py3-none-any.whl"
        },
        {
          "sha256": "8dd6e646e99ea382bd85f97a45e6b526a442d79423a7dc673f1e2756d05fcb5f",
          "destination": "fsspec-2026.9.0-py3-none-any.whl",
          "filename": "fsspec-2026.9.0-py3-none-any.whl"
        },
        {
          "sha256": "7e52c65bfbb7bd75ac1c28cb38f93b01e5f6a2ff013224e6213533451bfee517",
          "destination": "gradio-6.17.3-py3-none-any.whl",
          "filename": "gradio-6.17.3-py3-none-any.whl"
        },
        {
          "sha256": "d43e2179c29076292a76485ad7ed2e6eaa19d14ac58283bd7f5beabfe4ca958c",
          "destination": "gradio_client-2.5.0-py3-none-any.whl",
          "filename": "gradio_client-2.5.0-py3-none-any.whl"
        },
        {
          "sha256": "7f7975bab18c729a257a8b1ae9dcd70b7cafb1720481beae47719af57c35fa64",
          "destination": "groovy-0.1.2-py3-none-any.whl",
          "filename": "groovy-0.1.2-py3-none-any.whl"
        },
        {
          "sha256": "63cf8bbe7522de3bf65932fda1d9c2772064ffb3dae62d55932da54b31cb6c86",
          "destination": "h11-0.16.0-py3-none-any.whl",
          "filename": "h11-0.16.0-py3-none-any.whl"
        },
        {
          "sha256": "76b8cb8be6abe62d74c1ad2d35b42f0629db89aa9e1a8d033cecfe7c856eeab3",
          "destination": "hf_gradio-0.4.1-py3-none-any.whl",
          "filename": "hf_gradio-0.4.1-py3-none-any.whl"
        },
        {
          "sha256": "0e6e21fa3cdfcdcd76748564bf593870a5e013f47d97cf10aed63aa222cff5b7",
          "destination": "hf_xet-1.6.0-cp38-abi3-manylinux_2_28_aarch64.whl",
          "filename": "hf_xet-1.6.0-cp38-abi3-manylinux_2_28_aarch64.whl"
        },
        {
          "sha256": "2d400746a40668fc9dec9810239072b40b4484b640a8c38fd654a024c7a1bf55",
          "destination": "httpcore-1.0.9-py3-none-any.whl",
          "filename": "httpcore-1.0.9-py3-none-any.whl"
        },
        {
          "sha256": "d909fcccc110f8c7faf814ca82a9a4d816bc5a6dbfea25d6591d6985b8ba59ad",
          "destination": "httpx-0.28.1-py3-none-any.whl",
          "filename": "httpx-0.28.1-py3-none-any.whl"
        },
        {
          "sha256": "48f0c8eac16145dfce371e9d2d7772854a4f591bcb56c9cf548accf531d54270",
          "destination": "huggingface_hub-0.36.2-py3-none-any.whl",
          "filename": "huggingface_hub-0.36.2-py3-none-any.whl"
        },
        {
          "sha256": "ab7ae7122974553370f0bdb919e1a960b2cd1bc1ef0276416d896db81c14582c",
          "destination": "idna-3.20-py3-none-any.whl",
          "filename": "idna-3.20-py3-none-any.whl"
        },
        {
          "sha256": "c6242fc49e35958c8b15141343aa660db5fc54d4f13a1db01a3f5891b98700ef",
          "destination": "itsdangerous-2.2.0-py3-none-any.whl",
          "filename": "itsdangerous-2.2.0-py3-none-any.whl"
        },
        {
          "sha256": "85ece4451f492d0c13c5dd7c13a64681a86afae63a5f347908daf103ce6d2f67",
          "destination": "jinja2-3.1.6-py3-none-any.whl",
          "filename": "jinja2-3.1.6-py3-none-any.whl"
        },
        {
          "sha256": "3dbbf9f6e4b592a2357b854608e980fe6390d131d7a82f011a377ef2ebef7aba",
          "destination": "joblib-1.6.0-py3-none-any.whl",
          "filename": "joblib-1.6.0-py3-none-any.whl"
        },
        {
          "sha256": "77253be3391b06124a0e16105bd663b6c54470af1a9ca8e1cf026f38d58ed056",
          "destination": "lazy_loader-0.6-py3-none-any.whl",
          "filename": "lazy_loader-0.6-py3-none-any.whl"
        },
        {
          "sha256": "0b6415c4fd68bff4c29288abe67c6d80b587e0e1e2cfb0aad23e4559504a7fa1",
          "destination": "librosa-0.11.0-py3-none-any.whl",
          "filename": "librosa-0.11.0-py3-none-any.whl"
        },
        {
          "sha256": "0225351ad77ea30501fc5b4c09ff6868169fde50c5a576cdfda1645091157616",
          "destination": "llvmlite-0.50.0-cp311-cp311-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl",
          "filename": "llvmlite-0.50.0-cp311-cp311-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl"
        },
        {
          "sha256": "9f7ebbcd14fe59494226453aed97c1070d83f8d24b6fc3a3bcf9a38092641c4a",
          "destination": "markdown_it_py-4.2.0-py3-none-any.whl",
          "filename": "markdown_it_py-4.2.0-py3-none-any.whl"
        },
        {
          "sha256": "849dd2bb0e5e4ab2b71c7191726a4a8d5aa8a610daa584728cbee0b710ddc4ef",
          "destination": "markupsafe-3.0.4-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl",
          "filename": "markupsafe-3.0.4-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl"
        },
        {
          "sha256": "84008a41e51615a49fc9966191ff91509e3c40b939176e643fd50a5c2196b8f8",
          "destination": "mdurl-0.1.2-py3-none-any.whl",
          "filename": "mdurl-0.1.2-py3-none-any.whl"
        },
        {
          "sha256": "a0b2b9fe80bbcd81a6647ff13108738cfb482d481d826cc0e02f5b35e5c88d2c",
          "destination": "mpmath-1.3.0-py3-none-any.whl",
          "filename": "mpmath-1.3.0-py3-none-any.whl"
        },
        {
          "sha256": "6707d2fa2aa1bb5424ea0b05f44ffc989b15ab41a73ff5855bff4944fec7c8ac",
          "destination": "msgpack-1.2.3-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl",
          "filename": "msgpack-1.2.3-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl"
        },
        {
          "sha256": "53a9b7dbe925db6a8e9347f85718a72d4ebed8ffe2542af709229b48e505f965",
          "destination": "nagisa-0.2.11-cp311-cp311-manylinux_2_17_aarch64.manylinux2014_aarch64.whl",
          "filename": "nagisa-0.2.11-cp311-cp311-manylinux_2_17_aarch64.manylinux2014_aarch64.whl"
        },
        {
          "sha256": "29326d74f107c347fd1009bd58e38d9f7c7c5b51e6de97bc93dbc325d9038b54",
          "destination": "narwhals-2.26.0-py3-none-any.whl",
          "filename": "narwhals-2.26.0-py3-none-any.whl"
        },
        {
          "sha256": "d47fbf302e7d9cbbb9e2555a0d267983d2aa476bac30e90dfbe5669bd57f3762",
          "destination": "networkx-3.6.1-py3-none-any.whl",
          "filename": "networkx-3.6.1-py3-none-any.whl"
        },
        {
          "sha256": "954e2684bca3ea11235272df28e8ef40f18a682c1c635a2398032b404675d8fa",
          "destination": "numba-0.68.0-cp311-cp311-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl",
          "filename": "numba-0.68.0-cp311-cp311-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl"
        },
        {
          "sha256": "b64d8d4d17135e00c8e346e0a738deb17e754230d7e0810ac5012750bbd85a5a",
          "destination": "numpy-2.2.6-cp311-cp311-manylinux_2_17_aarch64.manylinux2014_aarch64.whl",
          "filename": "numpy-2.2.6-cp311-cp311-manylinux_2_17_aarch64.manylinux2014_aarch64.whl"
        },
        {
          "sha256": "80e068aba7cd56c8b58512d6a36f8d25cb1dfaa0c0a4cc1c938ccf9f362d9cb3",
          "destination": "opentelemetry_api-1.45.0-py3-none-any.whl",
          "filename": "opentelemetry_api-1.45.0-py3-none-any.whl"
        },
        {
          "sha256": "dce0166feb0a737ab84f598c9a338cbc0b764a036617aa686194f53c7eba0c3e",
          "destination": "orjson-3.12.0-cp311-cp311-manylinux_2_17_aarch64.manylinux2014_aarch64.whl",
          "filename": "orjson-3.12.0-cp311-cp311-manylinux_2_17_aarch64.manylinux2014_aarch64.whl"
        },
        {
          "sha256": "d7193f7c8e4e93f444fde0262bf90af30e16fa0ad0ad44cb553c87339b23cd1c",
          "destination": "packaging-26.3-py3-none-any.whl",
          "filename": "packaging-26.3-py3-none-any.whl"
        },
        {
          "sha256": "1e7c0afdcaf6661d795fcefc2f647ddd1136f62cdc153fba177c685d97a87808",
          "destination": "pandas-3.0.6-cp311-cp311-manylinux_2_24_aarch64.manylinux_2_28_aarch64.whl",
          "filename": "pandas-3.0.6-cp311-cp311-manylinux_2_24_aarch64.manylinux_2_28_aarch64.whl"
        },
        {
          "sha256": "bcb46e2f9feff8d06323983bd83ed00c201fdcab3d74973e7072a889b3979fcd",
          "destination": "pillow-12.3.0-cp311-cp311-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl",
          "filename": "pillow-12.3.0-cp311-cp311-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl"
        },
        {
          "sha256": "6d67a2b4e7f14d8b31b8b52648866fa717f45a1eb70e83002f4331d07e953717",
          "destination": "pip-25.2-py3-none-any.whl",
          "filename": "pip-25.2-py3-none-any.whl"
        },
        {
          "sha256": "080f3b39423b5abfca9a23d84c4e9795f54d395cd8459867a8ded44084fcd5f8",
          "destination": "platformdirs-4.12.3-py3-none-any.whl",
          "filename": "platformdirs-4.12.3-py3-none-any.whl"
        },
        {
          "sha256": "f265597baa9f760d25ceb29d0beb8186c243d6607b0f60b83ecf14078dbc703b",
          "destination": "pooch-1.9.0-py3-none-any.whl",
          "filename": "pooch-1.9.0-py3-none-any.whl"
        },
        {
          "sha256": "b0726cecd84f9474419d67252add4ac0cd9811b04d61123054b9fb6f57df6e9e",
          "destination": "psutil-7.2.2-cp36-abi3-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl",
          "filename": "psutil-7.2.2-cp36-abi3-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl"
        },
        {
          "sha256": "b727414169a36b7d524c1c3e31839a521725078d7b2ff038656844266160a992",
          "destination": "pycparser-3.0-py3-none-any.whl",
          "filename": "pycparser-3.0-py3-none-any.whl"
        },
        {
          "sha256": "346a034f080da3755d8e9cb5e00e8b07de1d39e4f6e2c87d8ab7cafa0b269a73",
          "destination": "pydantic-2.13.5-py3-none-any.whl",
          "filename": "pydantic-2.13.5-py3-none-any.whl"
        },
        {
          "sha256": "4f8507560a9284e1370bb048ed4282012fbef4e8d109875b95e884d228552061",
          "destination": "pydantic_core-2.46.5-cp311-cp311-manylinux_2_17_aarch64.manylinux2014_aarch64.whl",
          "filename": "pydantic_core-2.46.5-cp311-cp311-manylinux_2_17_aarch64.manylinux2014_aarch64.whl"
        },
        {
          "sha256": "65617e33033874b59d87db603aa1ed450633288aefead953b30bded59cb599a6",
          "destination": "pydub-0.25.1-py2.py3-none-any.whl",
          "filename": "pydub-0.25.1-py2.py3-none-any.whl"
        },
        {
          "sha256": "2363c69b61c4a97c838da3b130dcd6468f4848992b21a82f2a63ec34377137d9",
          "destination": "pygments-2.21.0-py3-none-any.whl",
          "filename": "pygments-2.21.0-py3-none-any.whl"
        },
        {
          "sha256": "a8b2bc7bffae282281c8140a97d3aa9c14da0b136dfe83f850eea9a5f7470427",
          "destination": "python_dateutil-2.9.0.post0-py2.py3-none-any.whl",
          "filename": "python_dateutil-2.9.0.post0-py2.py3-none-any.whl"
        },
        {
          "sha256": "ff6d3f776f16878c894e52e107296ffc890e913c611b1a4ec6c44e2821fe2e23",
          "destination": "python_multipart-0.0.32-py3-none-any.whl",
          "filename": "python_multipart-0.0.32-py3-none-any.whl"
        },
        {
          "sha256": "e658af3757f9e26a9d25dd2aff38335acd92bc9104f890a894b2c1ba28311b03",
          "destination": "pytz-2026.5-py2.py3-none-any.whl",
          "filename": "pytz-2026.5-py2.py3-none-any.whl"
        },
        {
          "sha256": "10892704fc220243f5305762e276552a0395f7beb4dbf9b14ec8fd43b57f126c",
          "destination": "pyyaml-6.0.3-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl",
          "filename": "pyyaml-6.0.3-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl"
        },
        {
          "sha256": "b9c55a38413298f3a990a4475467399daec6e8f4172363053fc42e2166c2dfd3",
          "destination": "qwen_asr-0.0.6-py3-none-any.whl",
          "filename": "qwen_asr-0.0.6-py3-none-any.whl"
        },
        {
          "sha256": "f111db07af669c83333411c5177131e18e831fe666d6a55a1af263952ada8939",
          "destination": "qwen_omni_utils-0.0.9-py3-none-any.whl",
          "filename": "qwen_omni_utils-0.0.9-py3-none-any.whl"
        },
        {
          "sha256": "7020ed44df30b3aa492c00ee3b52d0548c1f30c2c6c5bb13ae897680900d3413",
          "destination": "regex-2026.9.29-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl",
          "filename": "regex-2026.9.29-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl"
        },
        {
          "sha256": "2a0d60c172f83ac6ab31e4554906c0f3b3588d37b5cb939b1c061f4907e278e0",
          "destination": "requests-2.34.2-py3-none-any.whl",
          "filename": "requests-2.34.2-py3-none-any.whl"
        },
        {
          "sha256": "33bd4ef74232fb73fe9279a257718407f169c09b78a87ad3d296f548e27de0bb",
          "destination": "rich-15.0.0-py3-none-any.whl",
          "filename": "rich-15.0.0-py3-none-any.whl"
        },
        {
          "sha256": "c4f4a162db6993464d7ca3d7cc4af0ffc6515a606dfd220b9f82c6945d869cde",
          "destination": "safehttpx-0.1.7-py3-none-any.whl",
          "filename": "safehttpx-0.1.7-py3-none-any.whl"
        },
        {
          "sha256": "7a46e5ff292c356d6991e60942ba7f79817682d3a2cef0702136448cb9c4d235",
          "destination": "safetensors-0.8.0-cp310-abi3-manylinux_2_17_aarch64.manylinux2014_aarch64.whl",
          "filename": "safetensors-0.8.0-cp310-abi3-manylinux_2_17_aarch64.manylinux2014_aarch64.whl"
        },
        {
          "sha256": "4298fcc01b3d8fa9768d36894e99cce0747b3b2dd73bfd80779e393769d0afab",
          "destination": "scikit_learn-1.9.1-cp311-cp311-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl",
          "filename": "scikit_learn-1.9.1-cp311-cp311-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl"
        },
        {
          "sha256": "744b2bf3640d907b79f3fd7874efe432d1cf171ee721243e350f55234b4cec4c",
          "destination": "scipy-1.17.1-cp311-cp311-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl",
          "filename": "scipy-1.17.1-cp311-cp311-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl"
        },
        {
          "sha256": "de78a3b8e0feda74cabc54aab2da702113e33ac9d9eb9d2389bcf1f58b7d9177",
          "destination": "semantic_version-2.10.0-py2.py3-none-any.whl",
          "filename": "semantic_version-2.10.0-py2.py3-none-any.whl"
        },
        {
          "sha256": "7ecfff8f2fd72616f7481040475a65b2bf8af90a56c89140852d1120324e8686",
          "destination": "shellingham-1.5.4-py2.py3-none-any.whl",
          "filename": "shellingham-1.5.4-py2.py3-none-any.whl"
        },
        {
          "sha256": "b56808d19a79368dcaa507d02a4c1ce537ca713fab9fedd91256b4ec599c6bf7",
          "destination": "sherpa_onnx-1.13.8-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.whl",
          "filename": "sherpa_onnx-1.13.8-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.whl"
        },
        {
          "sha256": "a51a03d55c376c32e15dd63ea852236042ba91a5cd73e253bbf7cf21f6582ba9",
          "destination": "sherpa_onnx_core-1.13.8-py3-none-manylinux2014_aarch64.whl",
          "filename": "sherpa_onnx_core-1.13.8-py3-none-manylinux2014_aarch64.whl"
        },
        {
          "sha256": "4721f391ed90541fddacab5acf947aa0d3dc7d27b2e1e8eda2be8970586c3274",
          "destination": "six-1.17.0-py2.py3-none-any.whl",
          "filename": "six-1.17.0-py2.py3-none-any.whl"
        },
        {
          "sha256": "e85724a90bc99a6e8062c0b4ddf725f53b2a3b70afd4da875e9d2cfc4e92f377",
          "destination": "soundfile-0.14.0-py2.py3-none-manylinux_2_28_aarch64.whl",
          "filename": "soundfile-0.14.0-py2.py3-none-manylinux_2_28_aarch64.whl"
        },
        {
          "sha256": "54a4a89ab8b6153cbf61ed6297ac836face23d8664a6efefc557a22ed448bc6f",
          "destination": "sox-1.5.0-py3-none-any.whl",
          "filename": "sox-1.5.0-py3-none-any.whl"
        },
        {
          "sha256": "1577865e993f98ffb261257c3060fa76ec3db44ed3f181b16464268000424464",
          "destination": "soxr-1.1.0-cp311-cp311-manylinux_2_26_aarch64.manylinux_2_28_aarch64.whl",
          "filename": "soxr-1.1.0-cp311-cp311-manylinux_2_26_aarch64.manylinux_2_28_aarch64.whl"
        },
        {
          "sha256": "2aed0ced1f0f74f7bdd0bdc24a979c5cb9ee4a28393642db52a83d174ed65b7a",
          "destination": "soynlp-0.0.493-py3-none-any.whl",
          "filename": "soynlp-0.0.493-py3-none-any.whl"
        },
        {
          "sha256": "67f8e99895493dd2911a03f11314af6ceebeae4e704bb9f43dfc6a9db151c93e",
          "destination": "starlette-1.7.0-py3-none-any.whl",
          "filename": "starlette-1.7.0-py3-none-any.whl"
        },
        {
          "sha256": "e091cc3e99d2141a0ba2847328f5479b05d94a6635cb96148ccb3f34671bd8f5",
          "destination": "sympy-1.14.0-py3-none-any.whl",
          "filename": "sympy-1.14.0-py3-none-any.whl"
        },
        {
          "sha256": "cd8b60b5641b45c67bbf73c64c843235fc2d8a480c87389f52f5dbee893b86be",
          "destination": "threadpoolctl-3.7.0-py3-none-any.whl",
          "filename": "threadpoolctl-3.7.0-py3-none-any.whl"
        },
        {
          "sha256": "2249487018adec45d6e3554c71d46eb39fa8ea67156c640f7513eb26f318cec7",
          "destination": "tokenizers-0.22.2-cp39-abi3-manylinux_2_17_aarch64.manylinux2014_aarch64.whl",
          "filename": "tokenizers-0.22.2-cp39-abi3-manylinux_2_17_aarch64.manylinux2014_aarch64.whl"
        },
        {
          "sha256": "592064ed85b40fa213469f81ac584f67a4f2992509a7c3ea2d632208623a3680",
          "destination": "tomlkit-0.14.0-py3-none-any.whl",
          "filename": "tomlkit-0.14.0-py3-none-any.whl"
        },
        {
          "sha256": "680129efdeeec3db5da3f88ee5d28c1b1e103b774aef40f9d638e2cce8f8d8d8",
          "destination": "torch-2.8.0+cpu-cp311-cp311-manylinux_2_28_aarch64.whl",
          "filename": "torch-2.8.0+cpu-cp311-cp311-manylinux_2_28_aarch64.whl"
        },
        {
          "sha256": "c293e525e6fef9c20e8728fd4612df02a0aa31bb5fe91ecd93e123b1b7bffa73",
          "destination": "tqdm-4.70.1-py3-none-any.whl",
          "filename": "tqdm-4.70.1-py3-none-any.whl"
        },
        {
          "sha256": "4c9e9de11333ddfe5114bc872c9f370509198acf0b87a832a0ab9458e2bd0550",
          "destination": "transformers-4.57.6-py3-none-any.whl",
          "filename": "transformers-4.57.6-py3-none-any.whl"
        },
        {
          "sha256": "b3a5fc4342d5fc8fda8fc3010b1cf117e9249aab7fae800c2eff62fd3842d97d",
          "destination": "typer-0.27.2-py3-none-any.whl",
          "filename": "typer-0.27.2-py3-none-any.whl"
        },
        {
          "sha256": "481caa481374e813c1b176ada14e97f1f67a4539ce9cfeb3f350d78d6370c2e8",
          "destination": "typing_extensions-4.16.0-py3-none-any.whl",
          "filename": "typing_extensions-4.16.0-py3-none-any.whl"
        },
        {
          "sha256": "65b8397ba37ccbce054456aaccddfc91e6e3083c92824df348d96ca832f3f147",
          "destination": "typing_inspection-0.4.4-py3-none-any.whl",
          "filename": "typing_inspection-0.4.4-py3-none-any.whl"
        },
        {
          "sha256": "b683bd1b6659ddcd810ff02ad09ba821d4bf1065072805063eb35c49617905ac",
          "destination": "tzdata-2026.5-py2.py3-none-any.whl",
          "filename": "tzdata-2026.5-py2.py3-none-any.whl"
        },
        {
          "sha256": "0cf3cae568d36aa9576b28dfb35f11328f1cb974ca7647d9475ebb86c75ac6e3",
          "destination": "urllib3-2.8.0-py3-none-any.whl",
          "filename": "urllib3-2.8.0-py3-none-any.whl"
        },
        {
          "sha256": "505bdb0f318731d45f1f712071fc781a8981f6847a31c902c9f5e652d4f67faf",
          "destination": "uvicorn-0.54.0-py3-none-any.whl",
          "filename": "uvicorn-0.54.0-py3-none-any.whl"
        },
        {
          "sha256": "6392e50c78460ba618e5b21f08a71f59c99ce99cdc6cf6e3dd7e6ccca8754fab",
          "destination": "werkzeug-3.1.9-py3-none-any.whl",
          "filename": "werkzeug-3.1.9-py3-none-any.whl"
        }
      ],
      "packages": [
        "sherpa-onnx==1.13.8",
        "numpy==2.2.6",
        "torch==2.8.0+cpu",
        "qwen-asr==0.0.6",
        "huggingface-hub>=0.30"
      ],
      "dependenciesVerified": true,
      "enabled": true,
      "platformVerified": true
    },
    {
      "id": "win32-ia32-onnx-cpu",
      "version": "1",
      "platform": "win32",
      "arch": "ia32",
      "engine": "onnx",
      "accelerator": "cpu",
      "python": {
        "sha256": "daf24de7fb3b173e94e56a201d3f38dfedebbdc7ed1925f7aeb8ed588e2b4189",
        "format": "zip",
        "executable": "python.exe",
        "filename": "python-3.11.9-embed-win32.zip"
      },
      "wheels": [
        {
          "sha256": "1af303d6b2210eb850fcf03064d364652b7120803a0b872f5211f5234b399f20",
          "destination": "numpy-1.26.4-cp311-cp311-win32.whl",
          "filename": "numpy-1.26.4-cp311-cp311-win32.whl"
        },
        {
          "sha256": "6d67a2b4e7f14d8b31b8b52648866fa717f45a1eb70e83002f4331d07e953717",
          "destination": "pip-25.2-py3-none-any.whl",
          "filename": "pip-25.2-py3-none-any.whl"
        }
      ],
      "packages": [
        "numpy==1.26.4"
      ],
      "dependenciesVerified": true,
      "native": {
        "sha256": "3b25da29441b20b1b967ef1cac7834258b23c5c1baa8f26a1269debd384b79b5",
        "format": "tar.bz2",
        "destination": "sherpa-onnx-v1.13.8-win-x86-shared-MT-Release-no-tts.tar.bz2",
        "filename": "sherpa-onnx-v1.13.8-win-x86-shared-MT-Release-no-tts.tar.bz2"
      },
      "enabled": true,
      "platformVerified": true
    }
  ],
  "shared": [
    {
      "sha256": "9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6",
      "format": "file",
      "destination": "silero_vad.onnx",
      "role": "vad",
      "filename": "silero_vad.onnx"
    },
    {
      "sha256": "aa3cfc16963a10586a9393f5035d6d6b57e98d358b347f80c2a30bf4f00ceba2",
      "format": "file",
      "destination": "3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx",
      "role": "speaker",
      "filename": "3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx"
    },
    {
      "sha256": "5a2832047ea1f97dd0dc595b816c230c4bafad65cfc0341fa57517cadc50afd0",
      "format": "tar.bz2",
      "destination": "sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30.tar.bz2",
      "role": "preview",
      "filename": "sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30.tar.bz2"
    },
    {
      "sha256": "2e63e9a38b6e8fc0c7bc37ce174caca1862870856c6daf5697cfb785e925520b",
      "role": "license",
      "format": "file",
      "destination": "licenses/silero-vad-LICENSE.txt",
      "filename": "silero-vad-LICENSE.txt"
    },
    {
      "sha256": "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4",
      "role": "license",
      "format": "file",
      "destination": "licenses/3D-Speaker-LICENSE.txt",
      "filename": "3D-Speaker-LICENSE.txt"
    },
    {
      "sha256": "f382b62dcc61fc566b9215b1e3b604b539bfd96ed52ae1eeff5090f6dc176057",
      "role": "license",
      "format": "file",
      "destination": "licenses/FunASR-LICENSE.txt",
      "filename": "FunASR-LICENSE.txt"
    },
    {
      "sha256": "4bc3bffe14ebe38cc67309991e04f92866835eac1c5e2e1abd37163f67c6de5f",
      "role": "license",
      "format": "file",
      "destination": "licenses/SenseVoice-LICENSE.txt",
      "filename": "SenseVoice-LICENSE.txt"
    },
    {
      "sha256": "a44a6081c73ad75f0255bb2bb5cab74ef1829565a895a24e53a4f11290ab7655",
      "role": "license",
      "format": "file",
      "destination": "licenses/Qwen3-ASR-LICENSE.txt",
      "filename": "Qwen3-ASR-LICENSE.txt"
    }
  ],
  "files": {
    "9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6": {
      "sha256": "9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6",
      "filename": "silero_vad.onnx",
      "size": 643854,
      "sourceURL": "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx"
    },
    "aa3cfc16963a10586a9393f5035d6d6b57e98d358b347f80c2a30bf4f00ceba2": {
      "sha256": "aa3cfc16963a10586a9393f5035d6d6b57e98d358b347f80c2a30bf4f00ceba2",
      "filename": "3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx",
      "size": 28281164,
      "sourceURL": "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx"
    },
    "5a2832047ea1f97dd0dc595b816c230c4bafad65cfc0341fa57517cadc50afd0": {
      "sha256": "5a2832047ea1f97dd0dc595b816c230c4bafad65cfc0341fa57517cadc50afd0",
      "filename": "sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30.tar.bz2",
      "size": 132634597,
      "sourceURL": "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30.tar.bz2"
    },
    "a071ee5419e14adb34d7f970ab98105a45e6608018b168f023ca2e4810744abe": {
      "sha256": "a071ee5419e14adb34d7f970ab98105a45e6608018b168f023ca2e4810744abe",
      "filename": "sherpa-onnx-paraformer-zh-int8-2025-10-07.tar.bz2",
      "size": 228262632,
      "sourceURL": "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-paraformer-zh-int8-2025-10-07.tar.bz2"
    },
    "7305f7905bfcf77fa0b39388a313f3da35c68d971661a65475b56fb2162c8e63": {
      "sha256": "7305f7905bfcf77fa0b39388a313f3da35c68d971661a65475b56fb2162c8e63",
      "filename": "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09.tar.bz2",
      "size": 165783878,
      "sourceURL": "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09.tar.bz2"
    },
    "393f8a14e2f5fb96746aaab342997a40641001fbd5bf9592a080a8329178ee96": {
      "sha256": "393f8a14e2f5fb96746aaab342997a40641001fbd5bf9592a080a8329178ee96",
      "filename": "sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25.tar.bz2",
      "size": 878702423,
      "sourceURL": "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25.tar.bz2"
    },
    "75a8cfca24f00de72d796fbfed6858fc9614ef3dabd8696684cc3bc03a9c58ff": {
      "sha256": "75a8cfca24f00de72d796fbfed6858fc9614ef3dabd8696684cc3bc03a9c58ff",
      "filename": "chat_template.json",
      "size": 1161,
      "sourceURL": "https://huggingface.co/Qwen/Qwen3-ASR-1.7B/resolve/7278e1e70fe206f11671096ffdd38061171dd6e5/chat_template.json"
    },
    "2e74a751548b8ad7d7526d29365ad8144c345d8b412b1152d25dc6698452712f": {
      "sha256": "2e74a751548b8ad7d7526d29365ad8144c345d8b412b1152d25dc6698452712f",
      "filename": "config.json",
      "size": 6194,
      "sourceURL": "https://huggingface.co/Qwen/Qwen3-ASR-1.7B/resolve/7278e1e70fe206f11671096ffdd38061171dd6e5/config.json"
    },
    "1da527824d81e07118facff437e03f2e24a23311e3bdeb2368973fe77e5f275c": {
      "sha256": "1da527824d81e07118facff437e03f2e24a23311e3bdeb2368973fe77e5f275c",
      "filename": "generation_config.json",
      "size": 142,
      "sourceURL": "https://huggingface.co/Qwen/Qwen3-ASR-1.7B/resolve/7278e1e70fe206f11671096ffdd38061171dd6e5/generation_config.json"
    },
    "8831e4f1a044471340f7c0a83d7bd71306a5b867e95fd870f74d0c5308a904d5": {
      "sha256": "8831e4f1a044471340f7c0a83d7bd71306a5b867e95fd870f74d0c5308a904d5",
      "filename": "merges.txt",
      "size": 1671853,
      "sourceURL": "https://huggingface.co/Qwen/Qwen3-ASR-1.7B/resolve/7278e1e70fe206f11671096ffdd38061171dd6e5/merges.txt"
    },
    "a4cd1f1a04d90b757dc7f7dd26254e69a013b19e80efe590a83c6a3bde8608d6": {
      "sha256": "a4cd1f1a04d90b757dc7f7dd26254e69a013b19e80efe590a83c6a3bde8608d6",
      "filename": "model-00001-of-00002.safetensors",
      "size": 4220320824,
      "sourceURL": "https://huggingface.co/Qwen/Qwen3-ASR-1.7B/resolve/7278e1e70fe206f11671096ffdd38061171dd6e5/model-00001-of-00002.safetensors"
    },
    "6e0b9d9e09e2e0238e7ef3cc8a484ab387e91b90f1900bedf88bc92d7929ccfc": {
      "sha256": "6e0b9d9e09e2e0238e7ef3cc8a484ab387e91b90f1900bedf88bc92d7929ccfc",
      "filename": "model-00002-of-00002.safetensors",
      "size": 478200688,
      "sourceURL": "https://huggingface.co/Qwen/Qwen3-ASR-1.7B/resolve/7278e1e70fe206f11671096ffdd38061171dd6e5/model-00002-of-00002.safetensors"
    },
    "f994739fe38e5210b9e3e8ce6c6307315e2ceac3cb630e7b7414d69dce520f60": {
      "sha256": "f994739fe38e5210b9e3e8ce6c6307315e2ceac3cb630e7b7414d69dce520f60",
      "filename": "model.safetensors.index.json",
      "size": 64821,
      "sourceURL": "https://huggingface.co/Qwen/Qwen3-ASR-1.7B/resolve/7278e1e70fe206f11671096ffdd38061171dd6e5/model.safetensors.index.json"
    },
    "45e120a4eda2c20c5d7f2ea9354e63536bf35e27aa573fb7cdf78017b378770d": {
      "sha256": "45e120a4eda2c20c5d7f2ea9354e63536bf35e27aa573fb7cdf78017b378770d",
      "filename": "preprocessor_config.json",
      "size": 330,
      "sourceURL": "https://huggingface.co/Qwen/Qwen3-ASR-1.7B/resolve/7278e1e70fe206f11671096ffdd38061171dd6e5/preprocessor_config.json"
    },
    "4942d005604266809309cabc9f4e9cb89ce855d59b14681fdc0e1cc62ea26c4c": {
      "sha256": "4942d005604266809309cabc9f4e9cb89ce855d59b14681fdc0e1cc62ea26c4c",
      "filename": "tokenizer_config.json",
      "size": 12487,
      "sourceURL": "https://huggingface.co/Qwen/Qwen3-ASR-1.7B/resolve/7278e1e70fe206f11671096ffdd38061171dd6e5/tokenizer_config.json"
    },
    "ca10d7e9fb3ed18575dd1e277a2579c16d108e32f27439684afa0e10b1440910": {
      "sha256": "ca10d7e9fb3ed18575dd1e277a2579c16d108e32f27439684afa0e10b1440910",
      "filename": "vocab.json",
      "size": 2776833,
      "sourceURL": "https://huggingface.co/Qwen/Qwen3-ASR-1.7B/resolve/7278e1e70fe206f11671096ffdd38061171dd6e5/vocab.json"
    },
    "0f7defa7a0ed99b61e0df0bba5027474711521f1307cc3830c2f456401beeed5": {
      "sha256": "0f7defa7a0ed99b61e0df0bba5027474711521f1307cc3830c2f456401beeed5",
      "filename": "cpython-3.11.17+20261003-x86_64-pc-windows-msvc-install_only.tar.gz",
      "size": 48217207,
      "sourceURL": "https://github.com/astral-sh/python-build-standalone/releases/download/20261003/cpython-3.11.17%2B20261003-x86_64-pc-windows-msvc-install_only.tar.gz"
    },
    "e8213002e427c69c45a52bbd94163084025f533a55a59d6f9c5b820774ef3303": {
      "sha256": "e8213002e427c69c45a52bbd94163084025f533a55a59d6f9c5b820774ef3303",
      "filename": "numpy-2.2.6-cp311-cp311-win_amd64.whl",
      "size": 12907455,
      "sourceURL": "wheel:win32-x64-transformers-cuda/numpy-2.2.6-cp311-cp311-win_amd64.whl"
    },
    "6d67a2b4e7f14d8b31b8b52648866fa717f45a1eb70e83002f4331d07e953717": {
      "sha256": "6d67a2b4e7f14d8b31b8b52648866fa717f45a1eb70e83002f4331d07e953717",
      "filename": "pip-25.2-py3-none-any.whl",
      "size": 1752557,
      "sourceURL": "wheel:win32-ia32-onnx-cpu/pip-25.2-py3-none-any.whl"
    },
    "171e6fac715bae20e11829e8dbfc70ed990ede1b35e6332f8121b27691a002de": {
      "sha256": "171e6fac715bae20e11829e8dbfc70ed990ede1b35e6332f8121b27691a002de",
      "filename": "sherpa_onnx-1.13.8-cp311-cp311-win_amd64.whl",
      "size": 2283357,
      "sourceURL": "wheel:win32-x64-transformers-cuda/sherpa_onnx-1.13.8-cp311-cp311-win_amd64.whl"
    },
    "5579e80196d516e6dae23c8f629292ce3142ab8869925d32b94612fd86f93733": {
      "sha256": "5579e80196d516e6dae23c8f629292ce3142ab8869925d32b94612fd86f93733",
      "filename": "sherpa_onnx_core-1.13.8-py3-none-win_amd64.whl",
      "size": 16903581,
      "sourceURL": "wheel:win32-x64-transformers-cuda/sherpa_onnx_core-1.13.8-py3-none-win_amd64.whl"
    },
    "3e2091cd341423207e2f084a6654b1efcd250dc326f2a37d6dde446e07cabb11": {
      "sha256": "3e2091cd341423207e2f084a6654b1efcd250dc326f2a37d6dde446e07cabb11",
      "filename": "accelerate-1.12.0-py3-none-any.whl",
      "size": 380935,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/accelerate-1.12.0-py3-none-any.whl"
    },
    "117bac03a25ede5df5440e855b32d556049ca169ead221505badf432fed4b101": {
      "sha256": "117bac03a25ede5df5440e855b32d556049ca169ead221505badf432fed4b101",
      "filename": "annotated_doc-0.0.5-py3-none-any.whl",
      "size": 5302,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/annotated_doc-0.0.5-py3-none-any.whl"
    },
    "f072f4d804ea359e4eaf198b1af7a8b0943881a87f31bb764f8bf219bb9419e0": {
      "sha256": "f072f4d804ea359e4eaf198b1af7a8b0943881a87f31bb764f8bf219bb9419e0",
      "filename": "annotated_types-0.8.0-py3-none-any.whl",
      "size": 13427,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/annotated_types-0.8.0-py3-none-any.whl"
    },
    "6152fdbbf9a77fdec97731721bebf7c4c44f7c29b424b0065826173efc7ed101": {
      "sha256": "6152fdbbf9a77fdec97731721bebf7c4c44f7c29b424b0065826173efc7ed101",
      "filename": "anyio-4.15.1-py3-none-any.whl",
      "size": 132079,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/anyio-4.15.1-py3-none-any.whl"
    },
    "b30d1df6c5d3de5dcef0fb0e256f6ea17bdcf5f979408df0297d8a408e2971b4": {
      "sha256": "b30d1df6c5d3de5dcef0fb0e256f6ea17bdcf5f979408df0297d8a408e2971b4",
      "filename": "audioread-3.1.0-py3-none-any.whl",
      "size": 23143,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/audioread-3.1.0-py3-none-any.whl"
    },
    "ea1480b7a8d5405cb5f382b344731bf125fd2c1c6fae3964f6c48595628387ff": {
      "sha256": "ea1480b7a8d5405cb5f382b344731bf125fd2c1c6fae3964f6c48595628387ff",
      "filename": "av-18.1.0-cp311-abi3-win_amd64.whl",
      "size": 27595679,
      "sourceURL": "wheel:win32-x64-transformers-cuda/av-18.1.0-cp311-abi3-win_amd64.whl"
    },
    "ba0efaa9080b619ff2f3459d1d500c57bddea4a6b424b60a91141db6fd2f08bc": {
      "sha256": "ba0efaa9080b619ff2f3459d1d500c57bddea4a6b424b60a91141db6fd2f08bc",
      "filename": "blinker-1.9.0-py3-none-any.whl",
      "size": 8458,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/blinker-1.9.0-py3-none-any.whl"
    },
    "022426c9e99fd65d9475dce5c195526f04bb8be8907607e27e747893f6ee3e24": {
      "sha256": "022426c9e99fd65d9475dce5c195526f04bb8be8907607e27e747893f6ee3e24",
      "filename": "brotli-1.2.0-cp311-cp311-win_amd64.whl",
      "size": 369035,
      "sourceURL": "wheel:win32-x64-transformers-cuda/brotli-1.2.0-cp311-cp311-win_amd64.whl"
    },
    "62f22742b58a1a33014a2b6b706588a8d7e2a88ae7bd1a6ebe8c992928483775": {
      "sha256": "62f22742b58a1a33014a2b6b706588a8d7e2a88ae7bd1a6ebe8c992928483775",
      "filename": "certifi-2026.7.22-py3-none-any.whl",
      "size": 136983,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/certifi-2026.7.22-py3-none-any.whl"
    },
    "42f6930c31dc7f50732c9ae793c2786c7b6b044195967bbdde40bb9be81c4cc0": {
      "sha256": "42f6930c31dc7f50732c9ae793c2786c7b6b044195967bbdde40bb9be81c4cc0",
      "filename": "cffi-2.1.1-cp311-cp311-win_amd64.whl",
      "size": 185096,
      "sourceURL": "wheel:win32-x64-transformers-cuda/cffi-2.1.1-cp311-cp311-win_amd64.whl"
    },
    "87e50a3e7cb90af586b6c5faf23e302a970415ac73bd7bd90a515a04b427ef96": {
      "sha256": "87e50a3e7cb90af586b6c5faf23e302a970415ac73bd7bd90a515a04b427ef96",
      "filename": "charset_normalizer-3.5.2-cp311-cp311-win_amd64.whl",
      "size": 214932,
      "sourceURL": "wheel:win32-x64-transformers-cuda/charset_normalizer-3.5.2-cp311-cp311-win_amd64.whl"
    },
    "255bc9599cf7748b4b1a446ccc735421bd08a2ae529a8b88597d3de5664ee360": {
      "sha256": "255bc9599cf7748b4b1a446ccc735421bd08a2ae529a8b88597d3de5664ee360",
      "filename": "click-8.5.0-py3-none-any.whl",
      "size": 125251,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/click-8.5.0-py3-none-any.whl"
    },
    "9acb47f6afd73f60dc1df93bb801b472f05ff42fa6c84167d25cb206be1fbf4a": {
      "sha256": "9acb47f6afd73f60dc1df93bb801b472f05ff42fa6c84167d25cb206be1fbf4a",
      "filename": "cloudpickle-3.1.2-py3-none-any.whl",
      "size": 22228,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/cloudpickle-3.1.2-py3-none-any.whl"
    },
    "4f1d9991f5acc0ca119f9d443620b77f9d6b33703e51011c16baf57afb285fc6": {
      "sha256": "4f1d9991f5acc0ca119f9d443620b77f9d6b33703e51011c16baf57afb285fc6",
      "filename": "colorama-0.4.6-py2.py3-none-any.whl",
      "size": 25335,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/colorama-0.4.6-py2.py3-none-any.whl"
    },
    "8566ea804cfc265f5e9dda71d1b716aa24ee4c3423a5da4b28a248a78c33e3f9": {
      "sha256": "8566ea804cfc265f5e9dda71d1b716aa24ee4c3423a5da4b28a248a78c33e3f9",
      "filename": "cython-3.3.0-cp311-cp311-win_amd64.whl",
      "size": 2862883,
      "sourceURL": "wheel:win32-x64-transformers-cuda/cython-3.3.0-cp311-cp311-win_amd64.whl"
    },
    "f47fe6fdbd2edd623ecfe36875d37aba411624e2670dd395dddae1358689bb3c": {
      "sha256": "f47fe6fdbd2edd623ecfe36875d37aba411624e2670dd395dddae1358689bb3c",
      "filename": "decorator-5.3.1-py3-none-any.whl",
      "size": 10365,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/decorator-5.3.1-py3-none-any.whl"
    },
    "3d5a88d2ea7b518b422d57b3fbc123cd7f42e78c80357736f6f7b8f179fac6d9": {
      "sha256": "3d5a88d2ea7b518b422d57b3fbc123cd7f42e78c80357736f6f7b8f179fac6d9",
      "filename": "dynet38-2.2-cp311-cp311-win_amd64.whl",
      "size": 1306616,
      "sourceURL": "wheel:win32-x64-transformers-cuda/dynet38-2.2-cp311-cp311-win_amd64.whl"
    },
    "bd5f4d81f1e93a88bcd77caf4dfe3c2dbffc3805407a0007e9a114c18b3a670b": {
      "sha256": "bd5f4d81f1e93a88bcd77caf4dfe3c2dbffc3805407a0007e9a114c18b3a670b",
      "filename": "fastapi-0.142.2-py3-none-any.whl",
      "size": 144409,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/fastapi-0.142.2-py3-none-any.whl"
    },
    "7f0ca4bcc0e181c60dbbd8aa9ab5b120ebb99e4e064e83636340056f833a1f09": {
      "sha256": "7f0ca4bcc0e181c60dbbd8aa9ab5b120ebb99e4e064e83636340056f833a1f09",
      "filename": "filelock-3.32.3-py3-none-any.whl",
      "size": 98901,
      "sourceURL": "wheel:win32-x64-transformers-cuda/filelock-3.32.3-py3-none-any.whl"
    },
    "5f17ee83ecee8a6f3e389c75822fb70a1c2f0506b99438a6dffa1d56793588c8": {
      "sha256": "5f17ee83ecee8a6f3e389c75822fb70a1c2f0506b99438a6dffa1d56793588c8",
      "filename": "filelock-4.0.12-py3-none-any.whl",
      "size": 111732,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/filelock-4.0.12-py3-none-any.whl"
    },
    "f4bcbefc124291925f1a26446da31a5178f9483862233b23c0c96a20701f670c": {
      "sha256": "f4bcbefc124291925f1a26446da31a5178f9483862233b23c0c96a20701f670c",
      "filename": "flask-3.1.3-py3-none-any.whl",
      "size": 103424,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/flask-3.1.3-py3-none-any.whl"
    },
    "b57ddbafedfaef7018c1ecab32aa200a9d7ca26b77965f64e48b70061249d279": {
      "sha256": "b57ddbafedfaef7018c1ecab32aa200a9d7ca26b77965f64e48b70061249d279",
      "filename": "fsspec-2026.7.0-py3-none-any.whl",
      "size": 206583,
      "sourceURL": "wheel:win32-x64-transformers-cuda/fsspec-2026.7.0-py3-none-any.whl"
    },
    "8dd6e646e99ea382bd85f97a45e6b526a442d79423a7dc673f1e2756d05fcb5f": {
      "sha256": "8dd6e646e99ea382bd85f97a45e6b526a442d79423a7dc673f1e2756d05fcb5f",
      "filename": "fsspec-2026.9.0-py3-none-any.whl",
      "size": 221738,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/fsspec-2026.9.0-py3-none-any.whl"
    },
    "7e52c65bfbb7bd75ac1c28cb38f93b01e5f6a2ff013224e6213533451bfee517": {
      "sha256": "7e52c65bfbb7bd75ac1c28cb38f93b01e5f6a2ff013224e6213533451bfee517",
      "filename": "gradio-6.17.3-py3-none-any.whl",
      "size": 32329363,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/gradio-6.17.3-py3-none-any.whl"
    },
    "d43e2179c29076292a76485ad7ed2e6eaa19d14ac58283bd7f5beabfe4ca958c": {
      "sha256": "d43e2179c29076292a76485ad7ed2e6eaa19d14ac58283bd7f5beabfe4ca958c",
      "filename": "gradio_client-2.5.0-py3-none-any.whl",
      "size": 59952,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/gradio_client-2.5.0-py3-none-any.whl"
    },
    "7f7975bab18c729a257a8b1ae9dcd70b7cafb1720481beae47719af57c35fa64": {
      "sha256": "7f7975bab18c729a257a8b1ae9dcd70b7cafb1720481beae47719af57c35fa64",
      "filename": "groovy-0.1.2-py3-none-any.whl",
      "size": 14090,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/groovy-0.1.2-py3-none-any.whl"
    },
    "63cf8bbe7522de3bf65932fda1d9c2772064ffb3dae62d55932da54b31cb6c86": {
      "sha256": "63cf8bbe7522de3bf65932fda1d9c2772064ffb3dae62d55932da54b31cb6c86",
      "filename": "h11-0.16.0-py3-none-any.whl",
      "size": 37515,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/h11-0.16.0-py3-none-any.whl"
    },
    "76b8cb8be6abe62d74c1ad2d35b42f0629db89aa9e1a8d033cecfe7c856eeab3": {
      "sha256": "76b8cb8be6abe62d74c1ad2d35b42f0629db89aa9e1a8d033cecfe7c856eeab3",
      "filename": "hf_gradio-0.4.1-py3-none-any.whl",
      "size": 4482,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/hf_gradio-0.4.1-py3-none-any.whl"
    },
    "2d400746a40668fc9dec9810239072b40b4484b640a8c38fd654a024c7a1bf55": {
      "sha256": "2d400746a40668fc9dec9810239072b40b4484b640a8c38fd654a024c7a1bf55",
      "filename": "httpcore-1.0.9-py3-none-any.whl",
      "size": 78784,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/httpcore-1.0.9-py3-none-any.whl"
    },
    "d909fcccc110f8c7faf814ca82a9a4d816bc5a6dbfea25d6591d6985b8ba59ad": {
      "sha256": "d909fcccc110f8c7faf814ca82a9a4d816bc5a6dbfea25d6591d6985b8ba59ad",
      "filename": "httpx-0.28.1-py3-none-any.whl",
      "size": 73517,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/httpx-0.28.1-py3-none-any.whl"
    },
    "48f0c8eac16145dfce371e9d2d7772854a4f591bcb56c9cf548accf531d54270": {
      "sha256": "48f0c8eac16145dfce371e9d2d7772854a4f591bcb56c9cf548accf531d54270",
      "filename": "huggingface_hub-0.36.2-py3-none-any.whl",
      "size": 566395,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/huggingface_hub-0.36.2-py3-none-any.whl"
    },
    "ab7ae7122974553370f0bdb919e1a960b2cd1bc1ef0276416d896db81c14582c": {
      "sha256": "ab7ae7122974553370f0bdb919e1a960b2cd1bc1ef0276416d896db81c14582c",
      "filename": "idna-3.20-py3-none-any.whl",
      "size": 69583,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/idna-3.20-py3-none-any.whl"
    },
    "c6242fc49e35958c8b15141343aa660db5fc54d4f13a1db01a3f5891b98700ef": {
      "sha256": "c6242fc49e35958c8b15141343aa660db5fc54d4f13a1db01a3f5891b98700ef",
      "filename": "itsdangerous-2.2.0-py3-none-any.whl",
      "size": 16234,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/itsdangerous-2.2.0-py3-none-any.whl"
    },
    "85ece4451f492d0c13c5dd7c13a64681a86afae63a5f347908daf103ce6d2f67": {
      "sha256": "85ece4451f492d0c13c5dd7c13a64681a86afae63a5f347908daf103ce6d2f67",
      "filename": "jinja2-3.1.6-py3-none-any.whl",
      "size": 134899,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/jinja2-3.1.6-py3-none-any.whl"
    },
    "3dbbf9f6e4b592a2357b854608e980fe6390d131d7a82f011a377ef2ebef7aba": {
      "sha256": "3dbbf9f6e4b592a2357b854608e980fe6390d131d7a82f011a377ef2ebef7aba",
      "filename": "joblib-1.6.0-py3-none-any.whl",
      "size": 306115,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/joblib-1.6.0-py3-none-any.whl"
    },
    "77253be3391b06124a0e16105bd663b6c54470af1a9ca8e1cf026f38d58ed056": {
      "sha256": "77253be3391b06124a0e16105bd663b6c54470af1a9ca8e1cf026f38d58ed056",
      "filename": "lazy_loader-0.6-py3-none-any.whl",
      "size": 8791,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/lazy_loader-0.6-py3-none-any.whl"
    },
    "0b6415c4fd68bff4c29288abe67c6d80b587e0e1e2cfb0aad23e4559504a7fa1": {
      "sha256": "0b6415c4fd68bff4c29288abe67c6d80b587e0e1e2cfb0aad23e4559504a7fa1",
      "filename": "librosa-0.11.0-py3-none-any.whl",
      "size": 260749,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/librosa-0.11.0-py3-none-any.whl"
    },
    "ffe46ef508df226e54b5fe1f7bf11122e5297bcdbb3902cc5b670a429d56ff47": {
      "sha256": "ffe46ef508df226e54b5fe1f7bf11122e5297bcdbb3902cc5b670a429d56ff47",
      "filename": "llvmlite-0.50.0-cp311-cp311-win_amd64.whl",
      "size": 41865266,
      "sourceURL": "wheel:win32-x64-transformers-cuda/llvmlite-0.50.0-cp311-cp311-win_amd64.whl"
    },
    "9f7ebbcd14fe59494226453aed97c1070d83f8d24b6fc3a3bcf9a38092641c4a": {
      "sha256": "9f7ebbcd14fe59494226453aed97c1070d83f8d24b6fc3a3bcf9a38092641c4a",
      "filename": "markdown_it_py-4.2.0-py3-none-any.whl",
      "size": 91687,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/markdown_it_py-4.2.0-py3-none-any.whl"
    },
    "de8a88e63464af587c950061a5e6a67d3632e36df62b986892331d4620a35c01": {
      "sha256": "de8a88e63464af587c950061a5e6a67d3632e36df62b986892331d4620a35c01",
      "filename": "markupsafe-3.0.3-cp311-cp311-win_amd64.whl",
      "size": 15077,
      "sourceURL": "wheel:win32-x64-transformers-cuda/markupsafe-3.0.3-cp311-cp311-win_amd64.whl"
    },
    "fdb4ca07ab75ffadab4a8b135ad59cdbb3156b99310f3d565370da74a15d6bd3": {
      "sha256": "fdb4ca07ab75ffadab4a8b135ad59cdbb3156b99310f3d565370da74a15d6bd3",
      "filename": "markupsafe-3.0.4-cp311-cp311-win_amd64.whl",
      "size": 14328,
      "sourceURL": "wheel:win32-x64-transformers-cuda/markupsafe-3.0.4-cp311-cp311-win_amd64.whl"
    },
    "84008a41e51615a49fc9966191ff91509e3c40b939176e643fd50a5c2196b8f8": {
      "sha256": "84008a41e51615a49fc9966191ff91509e3c40b939176e643fd50a5c2196b8f8",
      "filename": "mdurl-0.1.2-py3-none-any.whl",
      "size": 9979,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/mdurl-0.1.2-py3-none-any.whl"
    },
    "a0b2b9fe80bbcd81a6647ff13108738cfb482d481d826cc0e02f5b35e5c88d2c": {
      "sha256": "a0b2b9fe80bbcd81a6647ff13108738cfb482d481d826cc0e02f5b35e5c88d2c",
      "filename": "mpmath-1.3.0-py3-none-any.whl",
      "size": 536198,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/mpmath-1.3.0-py3-none-any.whl"
    },
    "30e1522e4173230dca4d9ad896f038f73c0da6c1edd42f4dbad88ac583cf5d46": {
      "sha256": "30e1522e4173230dca4d9ad896f038f73c0da6c1edd42f4dbad88ac583cf5d46",
      "filename": "msgpack-1.2.3-cp311-cp311-win_amd64.whl",
      "size": 75850,
      "sourceURL": "wheel:win32-x64-transformers-cuda/msgpack-1.2.3-cp311-cp311-win_amd64.whl"
    },
    "551f8060e0208bbc80ab8766f923568b2cdbe49d47012cc0d29a310de0bd3a32": {
      "sha256": "551f8060e0208bbc80ab8766f923568b2cdbe49d47012cc0d29a310de0bd3a32",
      "filename": "nagisa-0.2.11-cp311-cp311-win_amd64.whl",
      "size": 21354044,
      "sourceURL": "wheel:win32-x64-transformers-cuda/nagisa-0.2.11-cp311-cp311-win_amd64.whl"
    },
    "29326d74f107c347fd1009bd58e38d9f7c7c5b51e6de97bc93dbc325d9038b54": {
      "sha256": "29326d74f107c347fd1009bd58e38d9f7c7c5b51e6de97bc93dbc325d9038b54",
      "filename": "narwhals-2.26.0-py3-none-any.whl",
      "size": 474034,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/narwhals-2.26.0-py3-none-any.whl"
    },
    "d47fbf302e7d9cbbb9e2555a0d267983d2aa476bac30e90dfbe5669bd57f3762": {
      "sha256": "d47fbf302e7d9cbbb9e2555a0d267983d2aa476bac30e90dfbe5669bd57f3762",
      "filename": "networkx-3.6.1-py3-none-any.whl",
      "size": 2068504,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/networkx-3.6.1-py3-none-any.whl"
    },
    "d36f7c6a07c27fa175f5a4683083c6a830f7791fbda592a8676ce47a444965f7": {
      "sha256": "d36f7c6a07c27fa175f5a4683083c6a830f7791fbda592a8676ce47a444965f7",
      "filename": "numba-0.68.0-cp311-cp311-win_amd64.whl",
      "size": 2830973,
      "sourceURL": "wheel:win32-x64-transformers-cuda/numba-0.68.0-cp311-cp311-win_amd64.whl"
    },
    "80e068aba7cd56c8b58512d6a36f8d25cb1dfaa0c0a4cc1c938ccf9f362d9cb3": {
      "sha256": "80e068aba7cd56c8b58512d6a36f8d25cb1dfaa0c0a4cc1c938ccf9f362d9cb3",
      "filename": "opentelemetry_api-1.45.0-py3-none-any.whl",
      "size": 60020,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/opentelemetry_api-1.45.0-py3-none-any.whl"
    },
    "fb2539159dfe8d371914f354360fa50e4a577cc89222a3828b9650a5e5040252": {
      "sha256": "fb2539159dfe8d371914f354360fa50e4a577cc89222a3828b9650a5e5040252",
      "filename": "orjson-3.12.0-cp311-cp311-win_amd64.whl",
      "size": 122084,
      "sourceURL": "wheel:win32-x64-transformers-cuda/orjson-3.12.0-cp311-cp311-win_amd64.whl"
    },
    "d7193f7c8e4e93f444fde0262bf90af30e16fa0ad0ad44cb553c87339b23cd1c": {
      "sha256": "d7193f7c8e4e93f444fde0262bf90af30e16fa0ad0ad44cb553c87339b23cd1c",
      "filename": "packaging-26.3-py3-none-any.whl",
      "size": 129956,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/packaging-26.3-py3-none-any.whl"
    },
    "2e5fa32ff162dfdbc280157d664f44d23049ae414725af9676df339c501d82cd": {
      "sha256": "2e5fa32ff162dfdbc280157d664f44d23049ae414725af9676df339c501d82cd",
      "filename": "pandas-3.0.6-cp311-cp311-win_amd64.whl",
      "size": 9859246,
      "sourceURL": "wheel:win32-x64-transformers-cuda/pandas-3.0.6-cp311-cp311-win_amd64.whl"
    },
    "8e95e1385e4998ae9694eeaa4730ba5457ff61185b3a55e2e7bea0880aef452a": {
      "sha256": "8e95e1385e4998ae9694eeaa4730ba5457ff61185b3a55e2e7bea0880aef452a",
      "filename": "pillow-12.3.0-cp311-cp311-win_amd64.whl",
      "size": 7233653,
      "sourceURL": "wheel:win32-x64-transformers-cuda/pillow-12.3.0-cp311-cp311-win_amd64.whl"
    },
    "080f3b39423b5abfca9a23d84c4e9795f54d395cd8459867a8ded44084fcd5f8": {
      "sha256": "080f3b39423b5abfca9a23d84c4e9795f54d395cd8459867a8ded44084fcd5f8",
      "filename": "platformdirs-4.12.3-py3-none-any.whl",
      "size": 32493,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/platformdirs-4.12.3-py3-none-any.whl"
    },
    "f265597baa9f760d25ceb29d0beb8186c243d6607b0f60b83ecf14078dbc703b": {
      "sha256": "f265597baa9f760d25ceb29d0beb8186c243d6607b0f60b83ecf14078dbc703b",
      "filename": "pooch-1.9.0-py3-none-any.whl",
      "size": 67175,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/pooch-1.9.0-py3-none-any.whl"
    },
    "eb7e81434c8d223ec4a219b5fc1c47d0417b12be7ea866e24fb5ad6e84b3d988": {
      "sha256": "eb7e81434c8d223ec4a219b5fc1c47d0417b12be7ea866e24fb5ad6e84b3d988",
      "filename": "psutil-7.2.2-cp37-abi3-win_amd64.whl",
      "size": 137737,
      "sourceURL": "wheel:win32-x64-transformers-cuda/psutil-7.2.2-cp37-abi3-win_amd64.whl"
    },
    "b727414169a36b7d524c1c3e31839a521725078d7b2ff038656844266160a992": {
      "sha256": "b727414169a36b7d524c1c3e31839a521725078d7b2ff038656844266160a992",
      "filename": "pycparser-3.0-py3-none-any.whl",
      "size": 48172,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/pycparser-3.0-py3-none-any.whl"
    },
    "346a034f080da3755d8e9cb5e00e8b07de1d39e4f6e2c87d8ab7cafa0b269a73": {
      "sha256": "346a034f080da3755d8e9cb5e00e8b07de1d39e4f6e2c87d8ab7cafa0b269a73",
      "filename": "pydantic-2.13.5-py3-none-any.whl",
      "size": 472589,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/pydantic-2.13.5-py3-none-any.whl"
    },
    "40375c2d05acec10323e45dfe2077ac44bc74659008614af5069034e2cfc781c": {
      "sha256": "40375c2d05acec10323e45dfe2077ac44bc74659008614af5069034e2cfc781c",
      "filename": "pydantic_core-2.46.5-cp311-cp311-win_amd64.whl",
      "size": 2041030,
      "sourceURL": "wheel:win32-x64-transformers-cuda/pydantic_core-2.46.5-cp311-cp311-win_amd64.whl"
    },
    "65617e33033874b59d87db603aa1ed450633288aefead953b30bded59cb599a6": {
      "sha256": "65617e33033874b59d87db603aa1ed450633288aefead953b30bded59cb599a6",
      "filename": "pydub-0.25.1-py2.py3-none-any.whl",
      "size": 32327,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/pydub-0.25.1-py2.py3-none-any.whl"
    },
    "2363c69b61c4a97c838da3b130dcd6468f4848992b21a82f2a63ec34377137d9": {
      "sha256": "2363c69b61c4a97c838da3b130dcd6468f4848992b21a82f2a63ec34377137d9",
      "filename": "pygments-2.21.0-py3-none-any.whl",
      "size": 1250147,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/pygments-2.21.0-py3-none-any.whl"
    },
    "a8b2bc7bffae282281c8140a97d3aa9c14da0b136dfe83f850eea9a5f7470427": {
      "sha256": "a8b2bc7bffae282281c8140a97d3aa9c14da0b136dfe83f850eea9a5f7470427",
      "filename": "python_dateutil-2.9.0.post0-py2.py3-none-any.whl",
      "size": 229892,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/python_dateutil-2.9.0.post0-py2.py3-none-any.whl"
    },
    "ff6d3f776f16878c894e52e107296ffc890e913c611b1a4ec6c44e2821fe2e23": {
      "sha256": "ff6d3f776f16878c894e52e107296ffc890e913c611b1a4ec6c44e2821fe2e23",
      "filename": "python_multipart-0.0.32-py3-none-any.whl",
      "size": 30042,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/python_multipart-0.0.32-py3-none-any.whl"
    },
    "e658af3757f9e26a9d25dd2aff38335acd92bc9104f890a894b2c1ba28311b03": {
      "sha256": "e658af3757f9e26a9d25dd2aff38335acd92bc9104f890a894b2c1ba28311b03",
      "filename": "pytz-2026.5-py2.py3-none-any.whl",
      "size": 506342,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/pytz-2026.5-py2.py3-none-any.whl"
    },
    "9f3bfb4965eb874431221a3ff3fdcddc7e74e3b07799e0e84ca4a0f867d449bf": {
      "sha256": "9f3bfb4965eb874431221a3ff3fdcddc7e74e3b07799e0e84ca4a0f867d449bf",
      "filename": "pyyaml-6.0.3-cp311-cp311-win_amd64.whl",
      "size": 158763,
      "sourceURL": "wheel:win32-x64-transformers-cuda/pyyaml-6.0.3-cp311-cp311-win_amd64.whl"
    },
    "b9c55a38413298f3a990a4475467399daec6e8f4172363053fc42e2166c2dfd3": {
      "sha256": "b9c55a38413298f3a990a4475467399daec6e8f4172363053fc42e2166c2dfd3",
      "filename": "qwen_asr-0.0.6-py3-none-any.whl",
      "size": 141603,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/qwen_asr-0.0.6-py3-none-any.whl"
    },
    "f111db07af669c83333411c5177131e18e831fe666d6a55a1af263952ada8939": {
      "sha256": "f111db07af669c83333411c5177131e18e831fe666d6a55a1af263952ada8939",
      "filename": "qwen_omni_utils-0.0.9-py3-none-any.whl",
      "size": 9657,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/qwen_omni_utils-0.0.9-py3-none-any.whl"
    },
    "1043aedf5917caa861bcb25a9c11460049656bdf0017a90a309fa8f255467725": {
      "sha256": "1043aedf5917caa861bcb25a9c11460049656bdf0017a90a309fa8f255467725",
      "filename": "regex-2026.9.29-cp311-cp311-win_amd64.whl",
      "size": 280641,
      "sourceURL": "wheel:win32-x64-transformers-cuda/regex-2026.9.29-cp311-cp311-win_amd64.whl"
    },
    "2a0d60c172f83ac6ab31e4554906c0f3b3588d37b5cb939b1c061f4907e278e0": {
      "sha256": "2a0d60c172f83ac6ab31e4554906c0f3b3588d37b5cb939b1c061f4907e278e0",
      "filename": "requests-2.34.2-py3-none-any.whl",
      "size": 73075,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/requests-2.34.2-py3-none-any.whl"
    },
    "33bd4ef74232fb73fe9279a257718407f169c09b78a87ad3d296f548e27de0bb": {
      "sha256": "33bd4ef74232fb73fe9279a257718407f169c09b78a87ad3d296f548e27de0bb",
      "filename": "rich-15.0.0-py3-none-any.whl",
      "size": 310654,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/rich-15.0.0-py3-none-any.whl"
    },
    "c4f4a162db6993464d7ca3d7cc4af0ffc6515a606dfd220b9f82c6945d869cde": {
      "sha256": "c4f4a162db6993464d7ca3d7cc4af0ffc6515a606dfd220b9f82c6945d869cde",
      "filename": "safehttpx-0.1.7-py3-none-any.whl",
      "size": 8959,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/safehttpx-0.1.7-py3-none-any.whl"
    },
    "096ec1a98435df7beb08853bb5aa9081a84f23d0adc67ed1a0a10550f608373f": {
      "sha256": "096ec1a98435df7beb08853bb5aa9081a84f23d0adc67ed1a0a10550f608373f",
      "filename": "safetensors-0.8.0-cp310-abi3-win_amd64.whl",
      "size": 355540,
      "sourceURL": "wheel:win32-x64-transformers-cuda/safetensors-0.8.0-cp310-abi3-win_amd64.whl"
    },
    "220fa18152852a5ce29c49e1eaba9d44ec44631cd2e5cf65f5a40eafa5ab3412": {
      "sha256": "220fa18152852a5ce29c49e1eaba9d44ec44631cd2e5cf65f5a40eafa5ab3412",
      "filename": "scikit_learn-1.9.1-cp311-cp311-win_amd64.whl",
      "size": 8329877,
      "sourceURL": "wheel:win32-x64-transformers-cuda/scikit_learn-1.9.1-cp311-cp311-win_amd64.whl"
    },
    "d30e57c72013c2a4fe441c2fcb8e77b14e152ad48b5464858e07e2ad9fbfceff": {
      "sha256": "d30e57c72013c2a4fe441c2fcb8e77b14e152ad48b5464858e07e2ad9fbfceff",
      "filename": "scipy-1.17.1-cp311-cp311-win_amd64.whl",
      "size": 36607512,
      "sourceURL": "wheel:win32-x64-transformers-cuda/scipy-1.17.1-cp311-cp311-win_amd64.whl"
    },
    "de78a3b8e0feda74cabc54aab2da702113e33ac9d9eb9d2389bcf1f58b7d9177": {
      "sha256": "de78a3b8e0feda74cabc54aab2da702113e33ac9d9eb9d2389bcf1f58b7d9177",
      "filename": "semantic_version-2.10.0-py2.py3-none-any.whl",
      "size": 15552,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/semantic_version-2.10.0-py2.py3-none-any.whl"
    },
    "7ecfff8f2fd72616f7481040475a65b2bf8af90a56c89140852d1120324e8686": {
      "sha256": "7ecfff8f2fd72616f7481040475a65b2bf8af90a56c89140852d1120324e8686",
      "filename": "shellingham-1.5.4-py2.py3-none-any.whl",
      "size": 9755,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/shellingham-1.5.4-py2.py3-none-any.whl"
    },
    "4721f391ed90541fddacab5acf947aa0d3dc7d27b2e1e8eda2be8970586c3274": {
      "sha256": "4721f391ed90541fddacab5acf947aa0d3dc7d27b2e1e8eda2be8970586c3274",
      "filename": "six-1.17.0-py2.py3-none-any.whl",
      "size": 11050,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/six-1.17.0-py2.py3-none-any.whl"
    },
    "299491d3499460fb1b74bb4bd78b57ffc2d243a5fafa7b6ec1b264875c78453e": {
      "sha256": "299491d3499460fb1b74bb4bd78b57ffc2d243a5fafa7b6ec1b264875c78453e",
      "filename": "soundfile-0.14.0-py2.py3-none-win_amd64.whl",
      "size": 1021480,
      "sourceURL": "wheel:win32-x64-transformers-cuda/soundfile-0.14.0-py2.py3-none-win_amd64.whl"
    },
    "54a4a89ab8b6153cbf61ed6297ac836face23d8664a6efefc557a22ed448bc6f": {
      "sha256": "54a4a89ab8b6153cbf61ed6297ac836face23d8664a6efefc557a22ed448bc6f",
      "filename": "sox-1.5.0-py3-none-any.whl",
      "size": 40164,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/sox-1.5.0-py3-none-any.whl"
    },
    "ae30c48ac795378cf23ba3c7c640b8ff794af714ac388b9fd6b31a40b39e6e86": {
      "sha256": "ae30c48ac795378cf23ba3c7c640b8ff794af714ac388b9fd6b31a40b39e6e86",
      "filename": "soxr-1.1.0-cp311-cp311-win_amd64.whl",
      "size": 176779,
      "sourceURL": "wheel:win32-x64-transformers-cuda/soxr-1.1.0-cp311-cp311-win_amd64.whl"
    },
    "2aed0ced1f0f74f7bdd0bdc24a979c5cb9ee4a28393642db52a83d174ed65b7a": {
      "sha256": "2aed0ced1f0f74f7bdd0bdc24a979c5cb9ee4a28393642db52a83d174ed65b7a",
      "filename": "soynlp-0.0.493-py3-none-any.whl",
      "size": 416753,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/soynlp-0.0.493-py3-none-any.whl"
    },
    "67f8e99895493dd2911a03f11314af6ceebeae4e704bb9f43dfc6a9db151c93e": {
      "sha256": "67f8e99895493dd2911a03f11314af6ceebeae4e704bb9f43dfc6a9db151c93e",
      "filename": "starlette-1.7.0-py3-none-any.whl",
      "size": 78980,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/starlette-1.7.0-py3-none-any.whl"
    },
    "e091cc3e99d2141a0ba2847328f5479b05d94a6635cb96148ccb3f34671bd8f5": {
      "sha256": "e091cc3e99d2141a0ba2847328f5479b05d94a6635cb96148ccb3f34671bd8f5",
      "filename": "sympy-1.14.0-py3-none-any.whl",
      "size": 6299353,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/sympy-1.14.0-py3-none-any.whl"
    },
    "cd8b60b5641b45c67bbf73c64c843235fc2d8a480c87389f52f5dbee893b86be": {
      "sha256": "cd8b60b5641b45c67bbf73c64c843235fc2d8a480c87389f52f5dbee893b86be",
      "filename": "threadpoolctl-3.7.0-py3-none-any.whl",
      "size": 26362,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/threadpoolctl-3.7.0-py3-none-any.whl"
    },
    "c9ea31edff2968b44a88f97d784c2f16dc0729b8b143ed004699ebca91f05c48": {
      "sha256": "c9ea31edff2968b44a88f97d784c2f16dc0729b8b143ed004699ebca91f05c48",
      "filename": "tokenizers-0.22.2-cp39-abi3-win_amd64.whl",
      "size": 2747786,
      "sourceURL": "wheel:win32-x64-transformers-cuda/tokenizers-0.22.2-cp39-abi3-win_amd64.whl"
    },
    "592064ed85b40fa213469f81ac584f67a4f2992509a7c3ea2d632208623a3680": {
      "sha256": "592064ed85b40fa213469f81ac584f67a4f2992509a7c3ea2d632208623a3680",
      "filename": "tomlkit-0.14.0-py3-none-any.whl",
      "size": 39310,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/tomlkit-0.14.0-py3-none-any.whl"
    },
    "7631ef49fbd38d382909525b83696dc12a55d68492ade4ace3883c62b9fc140f": {
      "sha256": "7631ef49fbd38d382909525b83696dc12a55d68492ade4ace3883c62b9fc140f",
      "filename": "torch-2.8.0+cpu-cp311-cp311-win_amd64.whl",
      "size": 619392861,
      "sourceURL": "wheel:win32-x64-transformers-cpu/torch-2.8.0+cpu-cp311-cp311-win_amd64.whl"
    },
    "c293e525e6fef9c20e8728fd4612df02a0aa31bb5fe91ecd93e123b1b7bffa73": {
      "sha256": "c293e525e6fef9c20e8728fd4612df02a0aa31bb5fe91ecd93e123b1b7bffa73",
      "filename": "tqdm-4.70.1-py3-none-any.whl",
      "size": 80199,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/tqdm-4.70.1-py3-none-any.whl"
    },
    "4c9e9de11333ddfe5114bc872c9f370509198acf0b87a832a0ab9458e2bd0550": {
      "sha256": "4c9e9de11333ddfe5114bc872c9f370509198acf0b87a832a0ab9458e2bd0550",
      "filename": "transformers-4.57.6-py3-none-any.whl",
      "size": 11993498,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/transformers-4.57.6-py3-none-any.whl"
    },
    "b3a5fc4342d5fc8fda8fc3010b1cf117e9249aab7fae800c2eff62fd3842d97d": {
      "sha256": "b3a5fc4342d5fc8fda8fc3010b1cf117e9249aab7fae800c2eff62fd3842d97d",
      "filename": "typer-0.27.2-py3-none-any.whl",
      "size": 123130,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/typer-0.27.2-py3-none-any.whl"
    },
    "481caa481374e813c1b176ada14e97f1f67a4539ce9cfeb3f350d78d6370c2e8": {
      "sha256": "481caa481374e813c1b176ada14e97f1f67a4539ce9cfeb3f350d78d6370c2e8",
      "filename": "typing_extensions-4.16.0-py3-none-any.whl",
      "size": 45571,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/typing_extensions-4.16.0-py3-none-any.whl"
    },
    "65b8397ba37ccbce054456aaccddfc91e6e3083c92824df348d96ca832f3f147": {
      "sha256": "65b8397ba37ccbce054456aaccddfc91e6e3083c92824df348d96ca832f3f147",
      "filename": "typing_inspection-0.4.4-py3-none-any.whl",
      "size": 14750,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/typing_inspection-0.4.4-py3-none-any.whl"
    },
    "b683bd1b6659ddcd810ff02ad09ba821d4bf1065072805063eb35c49617905ac": {
      "sha256": "b683bd1b6659ddcd810ff02ad09ba821d4bf1065072805063eb35c49617905ac",
      "filename": "tzdata-2026.5-py2.py3-none-any.whl",
      "size": 347996,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/tzdata-2026.5-py2.py3-none-any.whl"
    },
    "0cf3cae568d36aa9576b28dfb35f11328f1cb974ca7647d9475ebb86c75ac6e3": {
      "sha256": "0cf3cae568d36aa9576b28dfb35f11328f1cb974ca7647d9475ebb86c75ac6e3",
      "filename": "urllib3-2.8.0-py3-none-any.whl",
      "size": 135717,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/urllib3-2.8.0-py3-none-any.whl"
    },
    "505bdb0f318731d45f1f712071fc781a8981f6847a31c902c9f5e652d4f67faf": {
      "sha256": "505bdb0f318731d45f1f712071fc781a8981f6847a31c902c9f5e652d4f67faf",
      "filename": "uvicorn-0.54.0-py3-none-any.whl",
      "size": 87427,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/uvicorn-0.54.0-py3-none-any.whl"
    },
    "6392e50c78460ba618e5b21f08a71f59c99ce99cdc6cf6e3dd7e6ccca8754fab": {
      "sha256": "6392e50c78460ba618e5b21f08a71f59c99ce99cdc6cf6e3dd7e6ccca8754fab",
      "filename": "werkzeug-3.1.9-py3-none-any.whl",
      "size": 228700,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/werkzeug-3.1.9-py3-none-any.whl"
    },
    "34c55443aafd31046a7963b63d30bc3b628ee4a704f826796c865fdfd05bb596": {
      "sha256": "34c55443aafd31046a7963b63d30bc3b628ee4a704f826796c865fdfd05bb596",
      "filename": "torch-2.8.0+cu128-cp311-cp311-win_amd64.whl",
      "size": 3461420395,
      "sourceURL": "wheel:win32-x64-transformers-cuda/torch-2.8.0+cu128-cp311-cp311-win_amd64.whl"
    },
    "3663b71c18364eccfbad74c4f21f9f6149e40b07329cd776287410cc1da5d612": {
      "sha256": "3663b71c18364eccfbad74c4f21f9f6149e40b07329cd776287410cc1da5d612",
      "filename": "cpython-3.11.17+20261003-aarch64-apple-darwin-install_only.tar.gz",
      "size": 27099994,
      "sourceURL": "https://github.com/astral-sh/python-build-standalone/releases/download/20261003/cpython-3.11.17%2B20261003-aarch64-apple-darwin-install_only.tar.gz"
    },
    "c820a93b0255bc360f53eca31a0e676fd1101f673dda8da93454a12e23fc5f7a": {
      "sha256": "c820a93b0255bc360f53eca31a0e676fd1101f673dda8da93454a12e23fc5f7a",
      "filename": "numpy-2.2.6-cp311-cp311-macosx_11_0_arm64.whl",
      "size": 14406743,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/numpy-2.2.6-cp311-cp311-macosx_11_0_arm64.whl"
    },
    "8bb2b86ce44b5c5bb9949977177ddc36954c51097f81284d5ac48588e821ec07": {
      "sha256": "8bb2b86ce44b5c5bb9949977177ddc36954c51097f81284d5ac48588e821ec07",
      "filename": "sherpa_onnx-1.13.8-cp311-cp311-macosx_11_0_arm64.whl",
      "size": 2141306,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/sherpa_onnx-1.13.8-cp311-cp311-macosx_11_0_arm64.whl"
    },
    "9312bbd46c93e31cecd3abda9cc8e71881d86cc3da3c35c7445ab04025b9fc3e": {
      "sha256": "9312bbd46c93e31cecd3abda9cc8e71881d86cc3da3c35c7445ab04025b9fc3e",
      "filename": "sherpa_onnx_core-1.13.8-py3-none-macosx_11_0_arm64.whl",
      "size": 9552498,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/sherpa_onnx_core-1.13.8-py3-none-macosx_11_0_arm64.whl"
    },
    "5ae0524688fb6707c57a530c2325e13bb0090b745ba7b4a2cd6a3ce262572916": {
      "sha256": "5ae0524688fb6707c57a530c2325e13bb0090b745ba7b4a2cd6a3ce262572916",
      "filename": "torch-2.8.0-cp311-none-macosx_11_0_arm64.whl",
      "size": 73621174,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/torch-2.8.0-cp311-none-macosx_11_0_arm64.whl"
    },
    "b30a4e8d934558e19602b68998a4d9ac9f250fa0dacef216f7e8e40153b13316": {
      "sha256": "b30a4e8d934558e19602b68998a4d9ac9f250fa0dacef216f7e8e40153b13316",
      "filename": "av-18.1.0-cp311-abi3-macosx_14_0_arm64.whl",
      "size": 18217603,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/av-18.1.0-cp311-abi3-macosx_14_0_arm64.whl"
    },
    "15b33fe93cedc4caaff8a0bd1eb7e3dab1c61bb22a0bf5bdfdfd97cd7da79744": {
      "sha256": "15b33fe93cedc4caaff8a0bd1eb7e3dab1c61bb22a0bf5bdfdfd97cd7da79744",
      "filename": "brotli-1.2.0-cp311-cp311-macosx_10_9_universal2.whl",
      "size": 863110,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/brotli-1.2.0-cp311-cp311-macosx_10_9_universal2.whl"
    },
    "398aff33cee2767e3e781d2554c54bd0dff386bb437581e0d8011fde1a942ec1": {
      "sha256": "398aff33cee2767e3e781d2554c54bd0dff386bb437581e0d8011fde1a942ec1",
      "filename": "cffi-2.1.1-cp311-cp311-macosx_11_0_arm64.whl",
      "size": 184168,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/cffi-2.1.1-cp311-cp311-macosx_11_0_arm64.whl"
    },
    "3d21b8b13c7592db2ac5e544a6d83187b995257472b0c9e8351b6d507ae37ed6": {
      "sha256": "3d21b8b13c7592db2ac5e544a6d83187b995257472b0c9e8351b6d507ae37ed6",
      "filename": "charset_normalizer-3.5.2-cp311-cp311-macosx_10_9_universal2.whl",
      "size": 370642,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/charset_normalizer-3.5.2-cp311-cp311-macosx_10_9_universal2.whl"
    },
    "ec09dbf73ff4f7be2b339b995fadae9c4bb517bbbed7ec11d6fe99c2092b48fd": {
      "sha256": "ec09dbf73ff4f7be2b339b995fadae9c4bb517bbbed7ec11d6fe99c2092b48fd",
      "filename": "cython-3.3.0-cp311-cp311-macosx_11_0_arm64.whl",
      "size": 3134644,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/cython-3.3.0-cp311-cp311-macosx_11_0_arm64.whl"
    },
    "9a6b74b7e3e9e2f4cc253d25e35a46a1f0b8603a22d4c15ca2238e46401e1407": {
      "sha256": "9a6b74b7e3e9e2f4cc253d25e35a46a1f0b8603a22d4c15ca2238e46401e1407",
      "filename": "dyNET38-2.2-cp311-cp311-macosx_11_0_arm64.whl",
      "size": 2954588,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/dyNET38-2.2-cp311-cp311-macosx_11_0_arm64.whl"
    },
    "f0906082d9932ae0c0057fa194041c22b4e2cdb46b2592ef3b91f020d62a081a": {
      "sha256": "f0906082d9932ae0c0057fa194041c22b4e2cdb46b2592ef3b91f020d62a081a",
      "filename": "hf_xet-1.6.0-cp38-abi3-macosx_11_0_arm64.whl",
      "size": 3876287,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/hf_xet-1.6.0-cp38-abi3-macosx_11_0_arm64.whl"
    },
    "818b3d4845ac8e126e23cb500867570d0602a42a43e67b14acec31f046e03130": {
      "sha256": "818b3d4845ac8e126e23cb500867570d0602a42a43e67b14acec31f046e03130",
      "filename": "llvmlite-0.50.0-cp311-cp311-macosx_12_0_arm64.whl",
      "size": 40534276,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/llvmlite-0.50.0-cp311-cp311-macosx_12_0_arm64.whl"
    },
    "7d3391b2188d18737cb2fa147028b1096236eaa7e156446c650a489fa2cadc91": {
      "sha256": "7d3391b2188d18737cb2fa147028b1096236eaa7e156446c650a489fa2cadc91",
      "filename": "markupsafe-3.0.4-cp311-cp311-macosx_11_0_arm64.whl",
      "size": 12063,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/markupsafe-3.0.4-cp311-cp311-macosx_11_0_arm64.whl"
    },
    "9d7e9cbb0998bbfd363fd9a09c330520d5e9cb323c05b5a1a05865d23ccf2226": {
      "sha256": "9d7e9cbb0998bbfd363fd9a09c330520d5e9cb323c05b5a1a05865d23ccf2226",
      "filename": "msgpack-1.2.3-cp311-cp311-macosx_11_0_arm64.whl",
      "size": 89683,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/msgpack-1.2.3-cp311-cp311-macosx_11_0_arm64.whl"
    },
    "14ad851d6281671fdfcafd41ff276c3a46610c2f0ec53988561de3ab10037e62": {
      "sha256": "14ad851d6281671fdfcafd41ff276c3a46610c2f0ec53988561de3ab10037e62",
      "filename": "nagisa-0.2.11-cp311-cp311-macosx_11_0_arm64.whl",
      "size": 21348141,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/nagisa-0.2.11-cp311-cp311-macosx_11_0_arm64.whl"
    },
    "50399af9d3799a4677044294861169c614bd7e1d8bbfc9479f78a67ab28ff427": {
      "sha256": "50399af9d3799a4677044294861169c614bd7e1d8bbfc9479f78a67ab28ff427",
      "filename": "numba-0.68.0-cp311-cp311-macosx_12_0_arm64.whl",
      "size": 2759814,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/numba-0.68.0-cp311-cp311-macosx_12_0_arm64.whl"
    },
    "a94f0f0c6fcbb2b5bd9734c57a489c7584a732bbdf04a39e8c83b861e9d03e92": {
      "sha256": "a94f0f0c6fcbb2b5bd9734c57a489c7584a732bbdf04a39e8c83b861e9d03e92",
      "filename": "orjson-3.12.0-cp311-cp311-macosx_10_15_x86_64.macosx_11_0_arm64.macosx_10_15_universal2.whl",
      "size": 223409,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/orjson-3.12.0-cp311-cp311-macosx_10_15_x86_64.macosx_11_0_arm64.macosx_10_15_universal2.whl"
    },
    "d7564d86a94c2eb8ab290b07f63ddaae5c032fa53897c29a2ff2197d43aee8af": {
      "sha256": "d7564d86a94c2eb8ab290b07f63ddaae5c032fa53897c29a2ff2197d43aee8af",
      "filename": "pandas-3.0.6-cp311-cp311-macosx_11_0_arm64.whl",
      "size": 10023718,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/pandas-3.0.6-cp311-cp311-macosx_11_0_arm64.whl"
    },
    "37d6d0a00072fd2948eb22bce7e1475f34569d90c87c59f7a2ec59541b77f7a6": {
      "sha256": "37d6d0a00072fd2948eb22bce7e1475f34569d90c87c59f7a2ec59541b77f7a6",
      "filename": "pillow-12.3.0-cp311-cp311-macosx_11_0_arm64.whl",
      "size": 4785266,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/pillow-12.3.0-cp311-cp311-macosx_11_0_arm64.whl"
    },
    "1a7b04c10f32cc88ab39cbf606e117fd74721c831c98a27dc04578deb0c16979": {
      "sha256": "1a7b04c10f32cc88ab39cbf606e117fd74721c831c98a27dc04578deb0c16979",
      "filename": "psutil-7.2.2-cp36-abi3-macosx_11_0_arm64.whl",
      "size": 129859,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/psutil-7.2.2-cp36-abi3-macosx_11_0_arm64.whl"
    },
    "d625a186a65201c23a9e3b8ed9c47e90a026e03256608cc91851c6709096844f": {
      "sha256": "d625a186a65201c23a9e3b8ed9c47e90a026e03256608cc91851c6709096844f",
      "filename": "pydantic_core-2.46.5-cp311-cp311-macosx_11_0_arm64.whl",
      "size": 1921751,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/pydantic_core-2.46.5-cp311-cp311-macosx_11_0_arm64.whl"
    },
    "652cb6edd41e718550aad172851962662ff2681490a8a711af6a4d288dd96824": {
      "sha256": "652cb6edd41e718550aad172851962662ff2681490a8a711af6a4d288dd96824",
      "filename": "pyyaml-6.0.3-cp311-cp311-macosx_11_0_arm64.whl",
      "size": 175577,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/pyyaml-6.0.3-cp311-cp311-macosx_11_0_arm64.whl"
    },
    "066d0e3dbfdd739bce2bf8c2a41dd16f73e3d8adc2eb06dd803a36a307f56075": {
      "sha256": "066d0e3dbfdd739bce2bf8c2a41dd16f73e3d8adc2eb06dd803a36a307f56075",
      "filename": "regex-2026.9.29-cp311-cp311-macosx_11_0_arm64.whl",
      "size": 292123,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/regex-2026.9.29-cp311-cp311-macosx_11_0_arm64.whl"
    },
    "c80201d22cbf405b80647a60ada77bba06c8fba2da2743ba1e89cdcc39a81f25": {
      "sha256": "c80201d22cbf405b80647a60ada77bba06c8fba2da2743ba1e89cdcc39a81f25",
      "filename": "safetensors-0.8.0-cp310-abi3-macosx_11_0_arm64.whl",
      "size": 484562,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/safetensors-0.8.0-cp310-abi3-macosx_11_0_arm64.whl"
    },
    "b48b2b5b41d9c5fbafef5f37b042f61110df3318ad2a45baf57287ea5b9ba5a2": {
      "sha256": "b48b2b5b41d9c5fbafef5f37b042f61110df3318ad2a45baf57287ea5b9ba5a2",
      "filename": "scikit_learn-1.9.1-cp311-cp311-macosx_12_0_arm64.whl",
      "size": 8290892,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/scikit_learn-1.9.1-cp311-cp311-macosx_12_0_arm64.whl"
    },
    "e18f12c6b0bc5a592ed23d3f7b891f68fd7f8241d69b7883769eb5d5dfb52696": {
      "sha256": "e18f12c6b0bc5a592ed23d3f7b891f68fd7f8241d69b7883769eb5d5dfb52696",
      "filename": "scipy-1.17.1-cp311-cp311-macosx_12_0_arm64.whl",
      "size": 28162057,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/scipy-1.17.1-cp311-cp311-macosx_12_0_arm64.whl"
    },
    "d828d35a059626da52f1415b5faee610aeab393319cb3fc4a9aef47b619fc14c": {
      "sha256": "d828d35a059626da52f1415b5faee610aeab393319cb3fc4a9aef47b619fc14c",
      "filename": "soundfile-0.14.0-py2.py3-none-macosx_11_0_arm64.whl",
      "size": 1103726,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/soundfile-0.14.0-py2.py3-none-macosx_11_0_arm64.whl"
    },
    "bd30f7201eac896ebf5db7b09156e6f1a1b82601900d29d9c8449bdad8365b11": {
      "sha256": "bd30f7201eac896ebf5db7b09156e6f1a1b82601900d29d9c8449bdad8365b11",
      "filename": "soxr-1.1.0-cp311-cp311-macosx_11_0_arm64.whl",
      "size": 167381,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/soxr-1.1.0-cp311-cp311-macosx_11_0_arm64.whl"
    },
    "1e418a55456beedca4621dbab65a318981467a2b188e982a23e117f115ce5001": {
      "sha256": "1e418a55456beedca4621dbab65a318981467a2b188e982a23e117f115ce5001",
      "filename": "tokenizers-0.22.2-cp39-abi3-macosx_11_0_arm64.whl",
      "size": 2981472,
      "sourceURL": "wheel:darwin-arm64-transformers-cpu/tokenizers-0.22.2-cp39-abi3-macosx_11_0_arm64.whl"
    },
    "4338dc0c2b954f20ca6437406db5b806626c69bae3cafeec43f1b7d57dd72a88": {
      "sha256": "4338dc0c2b954f20ca6437406db5b806626c69bae3cafeec43f1b7d57dd72a88",
      "filename": "cpython-3.11.17+20261003-x86_64-apple-darwin-install_only.tar.gz",
      "size": 26992271,
      "sourceURL": "https://github.com/astral-sh/python-build-standalone/releases/download/20261003/cpython-3.11.17%2B20261003-x86_64-apple-darwin-install_only.tar.gz"
    },
    "f9f1adb22318e121c5c69a09142811a201ef17ab257a1e66ca3025065b7f53ae": {
      "sha256": "f9f1adb22318e121c5c69a09142811a201ef17ab257a1e66ca3025065b7f53ae",
      "filename": "numpy-2.2.6-cp311-cp311-macosx_10_9_x86_64.whl",
      "size": 21176963,
      "sourceURL": "wheel:darwin-x64-onnx-cpu/numpy-2.2.6-cp311-cp311-macosx_10_9_x86_64.whl"
    },
    "a00d9ceeb4d9531d2f5bd90d194d53408461c5aa6ff46e65f8776ed37007f3d0": {
      "sha256": "a00d9ceeb4d9531d2f5bd90d194d53408461c5aa6ff46e65f8776ed37007f3d0",
      "filename": "sherpa_onnx-1.13.8-cp311-cp311-macosx_10_15_x86_64.whl",
      "size": 2332701,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/sherpa_onnx-1.13.8-cp311-cp311-macosx_10_15_x86_64.whl"
    },
    "917422880287baa0f0ae1bd10d9528fa78af8cc7c233d2a953a185a4fe8d83f2": {
      "sha256": "917422880287baa0f0ae1bd10d9528fa78af8cc7c233d2a953a185a4fe8d83f2",
      "filename": "sherpa_onnx_core-1.13.8-py3-none-macosx_10_15_x86_64.whl",
      "size": 10878335,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/sherpa_onnx_core-1.13.8-py3-none-macosx_10_15_x86_64.whl"
    },
    "ae75d8bb6467895ed1f8572ededf7ffa49eac07f6e483222f5d7d62a41d12f04": {
      "sha256": "ae75d8bb6467895ed1f8572ededf7ffa49eac07f6e483222f5d7d62a41d12f04",
      "filename": "av-18.1.0-cp311-abi3-macosx_11_0_x86_64.whl",
      "size": 22546147,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/av-18.1.0-cp311-abi3-macosx_11_0_x86_64.whl"
    },
    "898be2be399c221d2671d29eed26b6b2713a02c2119168ed914e7d00ceadb56f": {
      "sha256": "898be2be399c221d2671d29eed26b6b2713a02c2119168ed914e7d00ceadb56f",
      "filename": "brotli-1.2.0-cp311-cp311-macosx_10_9_x86_64.whl",
      "size": 445438,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/brotli-1.2.0-cp311-cp311-macosx_10_9_x86_64.whl"
    },
    "c8d2c9fd1f2d16f780d15127abb050d13d1a76c03a4bd87d7e4980e45e511e12": {
      "sha256": "c8d2c9fd1f2d16f780d15127abb050d13d1a76c03a4bd87d7e4980e45e511e12",
      "filename": "cffi-2.1.1-cp311-cp311-macosx_10_15_x86_64.whl",
      "size": 183838,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/cffi-2.1.1-cp311-cp311-macosx_10_15_x86_64.whl"
    },
    "e0d2713d2b292c826bc21dc8732bd9e47628103aa3764180c881e04b3fef95dc": {
      "sha256": "e0d2713d2b292c826bc21dc8732bd9e47628103aa3764180c881e04b3fef95dc",
      "filename": "cython-3.3.0-cp39-abi3-macosx_10_9_x86_64.whl",
      "size": 3063660,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/cython-3.3.0-cp39-abi3-macosx_10_9_x86_64.whl"
    },
    "fed13baeb332b9d761ffd3e61983e4b0a107ab57e0e5fbde90e3f94d059306c8": {
      "sha256": "fed13baeb332b9d761ffd3e61983e4b0a107ab57e0e5fbde90e3f94d059306c8",
      "filename": "dynet38-2.2-cp311-cp311-macosx_10_9_x86_64.whl",
      "size": 3695298,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/dynet38-2.2-cp311-cp311-macosx_10_9_x86_64.whl"
    },
    "633dc0cd71d32da58ab8c03ad38e2fac452c15c2b0a2866ebf6ededfe0a5061d": {
      "sha256": "633dc0cd71d32da58ab8c03ad38e2fac452c15c2b0a2866ebf6ededfe0a5061d",
      "filename": "hf_xet-1.6.0-cp38-abi3-macosx_10_12_x86_64.whl",
      "size": 4071729,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/hf_xet-1.6.0-cp38-abi3-macosx_10_12_x86_64.whl"
    },
    "60f92868d5d3af30b4239b50e1717cb4e4e54f6ac1c361a27903b318d0f07f42": {
      "sha256": "60f92868d5d3af30b4239b50e1717cb4e4e54f6ac1c361a27903b318d0f07f42",
      "filename": "llvmlite-0.45.1-cp311-cp311-macosx_10_15_x86_64.whl",
      "size": 43043526,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/llvmlite-0.45.1-cp311-cp311-macosx_10_15_x86_64.whl"
    },
    "9e25feb9e330b63edb0278a0acdf85e50d0cb0fbf49c3084abbe4e24ae195346": {
      "sha256": "9e25feb9e330b63edb0278a0acdf85e50d0cb0fbf49c3084abbe4e24ae195346",
      "filename": "markupsafe-3.0.4-cp311-cp311-macosx_10_9_x86_64.whl",
      "size": 11520,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/markupsafe-3.0.4-cp311-cp311-macosx_10_9_x86_64.whl"
    },
    "ec90a9ae3e1169fa1171147340f0e97d941aa19fcd3b34e8339a55933ed042af": {
      "sha256": "ec90a9ae3e1169fa1171147340f0e97d941aa19fcd3b34e8339a55933ed042af",
      "filename": "msgpack-1.2.3-cp311-cp311-macosx_10_9_x86_64.whl",
      "size": 90404,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/msgpack-1.2.3-cp311-cp311-macosx_10_9_x86_64.whl"
    },
    "41db2de9a2c39b7ea64deb8d89073e9dc2303157e3775fa03f6b17d872be3386": {
      "sha256": "41db2de9a2c39b7ea64deb8d89073e9dc2303157e3775fa03f6b17d872be3386",
      "filename": "nagisa-0.2.11-cp311-cp311-macosx_10_9_x86_64.whl",
      "size": 21351995,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/nagisa-0.2.11-cp311-cp311-macosx_10_9_x86_64.whl"
    },
    "f43e24b057714e480fe44bc6031de499e7cf8150c63eb461192caa6cc8530bc8": {
      "sha256": "f43e24b057714e480fe44bc6031de499e7cf8150c63eb461192caa6cc8530bc8",
      "filename": "numba-0.62.1-cp311-cp311-macosx_10_15_x86_64.whl",
      "size": 2684279,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/numba-0.62.1-cp311-cp311-macosx_10_15_x86_64.whl"
    },
    "4c66707fabe114439db9068ee468c26bbdf909cac0fb58686a42a24de1760c71": {
      "sha256": "4c66707fabe114439db9068ee468c26bbdf909cac0fb58686a42a24de1760c71",
      "filename": "numpy-1.26.4-cp311-cp311-macosx_10_9_x86_64.whl",
      "size": 20630554,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/numpy-1.26.4-cp311-cp311-macosx_10_9_x86_64.whl"
    },
    "085e3786ae6b2e82b406266bce36690f72b9dc1421903ba9296b2981a9fcf586": {
      "sha256": "085e3786ae6b2e82b406266bce36690f72b9dc1421903ba9296b2981a9fcf586",
      "filename": "pandas-3.0.6-cp311-cp311-macosx_10_9_x86_64.whl",
      "size": 10391798,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/pandas-3.0.6-cp311-cp311-macosx_10_9_x86_64.whl"
    },
    "00808c5e14ef63ac5161091d242999076604ff74b883423a11e5d7bbb38bf756": {
      "sha256": "00808c5e14ef63ac5161091d242999076604ff74b883423a11e5d7bbb38bf756",
      "filename": "pillow-12.3.0-cp311-cp311-macosx_10_10_x86_64.whl",
      "size": 5392415,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/pillow-12.3.0-cp311-cp311-macosx_10_10_x86_64.whl"
    },
    "ed0cace939114f62738d808fdcecd4c869222507e266e574799e9c0faa17d486": {
      "sha256": "ed0cace939114f62738d808fdcecd4c869222507e266e574799e9c0faa17d486",
      "filename": "psutil-7.2.2-cp36-abi3-macosx_10_9_x86_64.whl",
      "size": 129090,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/psutil-7.2.2-cp36-abi3-macosx_10_9_x86_64.whl"
    },
    "a1dee1b804ff4d11c663636cf15d2ea47e9f79cd56c033fb1cbf08924842a48f": {
      "sha256": "a1dee1b804ff4d11c663636cf15d2ea47e9f79cd56c033fb1cbf08924842a48f",
      "filename": "pydantic_core-2.46.5-cp311-cp311-macosx_10_12_x86_64.whl",
      "size": 2074737,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/pydantic_core-2.46.5-cp311-cp311-macosx_10_12_x86_64.whl"
    },
    "44edc647873928551a01e7a563d7452ccdebee747728c1080d881d68af7b997e": {
      "sha256": "44edc647873928551a01e7a563d7452ccdebee747728c1080d881d68af7b997e",
      "filename": "pyyaml-6.0.3-cp311-cp311-macosx_10_13_x86_64.whl",
      "size": 185826,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/pyyaml-6.0.3-cp311-cp311-macosx_10_13_x86_64.whl"
    },
    "b7b893976e7fe42053da64f2aa27239c24252fd2ec6df471e1be197c0addc3b1": {
      "sha256": "b7b893976e7fe42053da64f2aa27239c24252fd2ec6df471e1be197c0addc3b1",
      "filename": "regex-2026.9.29-cp311-cp311-macosx_10_9_x86_64.whl",
      "size": 295145,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/regex-2026.9.29-cp311-cp311-macosx_10_9_x86_64.whl"
    },
    "c554f85858e05226d3c2828e32395e677434685d6d94594a41643361c5e837f0": {
      "sha256": "c554f85858e05226d3c2828e32395e677434685d6d94594a41643361c5e837f0",
      "filename": "safetensors-0.8.0-cp310-abi3-macosx_10_12_x86_64.whl",
      "size": 473568,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/safetensors-0.8.0-cp310-abi3-macosx_10_12_x86_64.whl"
    },
    "326c188f92084bf58664229f4578eeab6176313b37cd5dfc85abd92b94130c58": {
      "sha256": "326c188f92084bf58664229f4578eeab6176313b37cd5dfc85abd92b94130c58",
      "filename": "scikit_learn-1.9.1-cp311-cp311-macosx_10_9_x86_64.whl",
      "size": 8823771,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/scikit_learn-1.9.1-cp311-cp311-macosx_10_9_x86_64.whl"
    },
    "1f95b894f13729334fb990162e911c9e5dc1ab390c58aa6cbecb389c5b5e28ec": {
      "sha256": "1f95b894f13729334fb990162e911c9e5dc1ab390c58aa6cbecb389c5b5e28ec",
      "filename": "scipy-1.17.1-cp311-cp311-macosx_10_14_x86_64.whl",
      "size": 31613675,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/scipy-1.17.1-cp311-cp311-macosx_10_14_x86_64.whl"
    },
    "19be05428da76ed61a4cad29b8e4bcf43a3e5c100089d2ec81dc961eed1b0dd4": {
      "sha256": "19be05428da76ed61a4cad29b8e4bcf43a3e5c100089d2ec81dc961eed1b0dd4",
      "filename": "soundfile-0.14.0-py2.py3-none-macosx_10_9_x86_64.whl",
      "size": 1144568,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/soundfile-0.14.0-py2.py3-none-macosx_10_9_x86_64.whl"
    },
    "34cc92208c3c412c046813e69da639c04a792c6a41fbfd7d909d359cd3e97a2d": {
      "sha256": "34cc92208c3c412c046813e69da639c04a792c6a41fbfd7d909d359cd3e97a2d",
      "filename": "soxr-1.1.0-cp311-cp311-macosx_10_14_x86_64.whl",
      "size": 205699,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/soxr-1.1.0-cp311-cp311-macosx_10_14_x86_64.whl"
    },
    "544dd704ae7238755d790de45ba8da072e9af3eea688f698b137915ae959281c": {
      "sha256": "544dd704ae7238755d790de45ba8da072e9af3eea688f698b137915ae959281c",
      "filename": "tokenizers-0.22.2-cp39-abi3-macosx_10_12_x86_64.whl",
      "size": 3100275,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/tokenizers-0.22.2-cp39-abi3-macosx_10_12_x86_64.whl"
    },
    "95b9b44f3bcebd8b6cd8d37ec802048c872d9c567ba52c894bba90863a439059": {
      "sha256": "95b9b44f3bcebd8b6cd8d37ec802048c872d9c567ba52c894bba90863a439059",
      "filename": "torch-2.2.2-cp311-none-macosx_10_9_x86_64.whl",
      "size": 150796474,
      "sourceURL": "wheel:darwin-x64-transformers-cpu/torch-2.2.2-cp311-none-macosx_10_9_x86_64.whl"
    },
    "c624af93ad62a596806bbd2404e1fb80744a407ca7279854445ede16d93858b8": {
      "sha256": "c624af93ad62a596806bbd2404e1fb80744a407ca7279854445ede16d93858b8",
      "filename": "cpython-3.11.17+20261003-x86_64-unknown-linux-gnu-install_only.tar.gz",
      "size": 48919491,
      "sourceURL": "https://github.com/astral-sh/python-build-standalone/releases/download/20261003/cpython-3.11.17%2B20261003-x86_64-unknown-linux-gnu-install_only.tar.gz"
    },
    "ba10f8411898fc418a521833e014a77d3ca01c15b0c6cdcce6a0d2897e6dbbdf": {
      "sha256": "ba10f8411898fc418a521833e014a77d3ca01c15b0c6cdcce6a0d2897e6dbbdf",
      "filename": "numpy-2.2.6-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
      "size": 16821570,
      "sourceURL": "wheel:linux-x64-transformers-cuda/numpy-2.2.6-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl"
    },
    "94fd1476b56ed36b851da8db9bd5144e92f669007ad54e0d8094913e4fbf1418": {
      "sha256": "94fd1476b56ed36b851da8db9bd5144e92f669007ad54e0d8094913e4fbf1418",
      "filename": "sherpa_onnx-1.13.8-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
      "size": 4398381,
      "sourceURL": "wheel:linux-x64-transformers-cuda/sherpa_onnx-1.13.8-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
    },
    "4da90acf435373d7b2ba9cc0be806e7e274d28f63f5780880b5dea6721626e36": {
      "sha256": "4da90acf435373d7b2ba9cc0be806e7e274d28f63f5780880b5dea6721626e36",
      "filename": "sherpa_onnx_core-1.13.8-py3-none-manylinux2014_x86_64.whl",
      "size": 10642497,
      "sourceURL": "wheel:linux-x64-transformers-cuda/sherpa_onnx_core-1.13.8-py3-none-manylinux2014_x86_64.whl"
    },
    "cb06175284673a581dd91fb1965662ae4ecaba6e5c357aa0ea7bb8b84b6b7eeb": {
      "sha256": "cb06175284673a581dd91fb1965662ae4ecaba6e5c357aa0ea7bb8b84b6b7eeb",
      "filename": "torch-2.8.0+cpu-cp311-cp311-manylinux_2_28_x86_64.whl",
      "size": 184053363,
      "sourceURL": "wheel:linux-x64-transformers-cpu/torch-2.8.0+cpu-cp311-cp311-manylinux_2_28_x86_64.whl"
    },
    "8a032e8d8ebc73dec079364b9b4a6837638a2d106e8472314e685ffbf163e700": {
      "sha256": "8a032e8d8ebc73dec079364b9b4a6837638a2d106e8472314e685ffbf163e700",
      "filename": "av-18.1.0-cp311-abi3-manylinux_2_28_x86_64.whl",
      "size": 35786210,
      "sourceURL": "wheel:linux-x64-transformers-cuda/av-18.1.0-cp311-abi3-manylinux_2_28_x86_64.whl"
    },
    "40d918bce2b427a0c4ba189df7a006ac0c7277c180aee4617d99e9ccaaf59e6a": {
      "sha256": "40d918bce2b427a0c4ba189df7a006ac0c7277c180aee4617d99e9ccaaf59e6a",
      "filename": "brotli-1.2.0-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
      "size": 1426014,
      "sourceURL": "wheel:linux-x64-transformers-cuda/brotli-1.2.0-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
    },
    "34e261f78cb6ceaaa36f42f2613f4380d94d9c759a9c73c769ee6e0247364632": {
      "sha256": "34e261f78cb6ceaaa36f42f2613f4380d94d9c759a9c73c769ee6e0247364632",
      "filename": "cffi-2.1.1-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
      "size": 217807,
      "sourceURL": "wheel:linux-x64-transformers-cuda/cffi-2.1.1-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
    },
    "211d5a3eb6af8f513b8d4ca19a8c1b7accab1b5f0d3175f9826b03c1a920dc1f": {
      "sha256": "211d5a3eb6af8f513b8d4ca19a8c1b7accab1b5f0d3175f9826b03c1a920dc1f",
      "filename": "charset_normalizer-3.5.2-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl",
      "size": 269972,
      "sourceURL": "wheel:linux-x64-transformers-cuda/charset_normalizer-3.5.2-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl"
    },
    "e6035b5231a9316edc19d6415f4296fd1d0370e2a165a714b3edc167b9ca00e1": {
      "sha256": "e6035b5231a9316edc19d6415f4296fd1d0370e2a165a714b3edc167b9ca00e1",
      "filename": "cython-3.3.0-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl",
      "size": 3479260,
      "sourceURL": "wheel:linux-x64-transformers-cuda/cython-3.3.0-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl"
    },
    "8963383d935e802941c8f9d778403798452e172150c3b4b5dee288d50b62ecc8": {
      "sha256": "8963383d935e802941c8f9d778403798452e172150c3b4b5dee288d50b62ecc8",
      "filename": "dyNET38-2.2-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
      "size": 6961879,
      "sourceURL": "wheel:linux-x64-transformers-cuda/dyNET38-2.2-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl"
    },
    "d62671bb130879cef0ee4c9ebe47a14af6c66ec53e6d84dc15936e5ffdfac82f": {
      "sha256": "d62671bb130879cef0ee4c9ebe47a14af6c66ec53e6d84dc15936e5ffdfac82f",
      "filename": "hf_xet-1.6.0-cp38-abi3-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
      "size": 4464663,
      "sourceURL": "wheel:linux-x64-transformers-cuda/hf_xet-1.6.0-cp38-abi3-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
    },
    "a6ffde00d4be8772a24e3e8b3af6bf86a79e7cf066d944ef56136b3957d707dc": {
      "sha256": "a6ffde00d4be8772a24e3e8b3af6bf86a79e7cf066d944ef56136b3957d707dc",
      "filename": "llvmlite-0.50.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl",
      "size": 59696588,
      "sourceURL": "wheel:linux-x64-transformers-cuda/llvmlite-0.50.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl"
    },
    "6da83a088f8ef93b2d483a8232a4dbf4d69d3d8496b568a03c56becac43e1808": {
      "sha256": "6da83a088f8ef93b2d483a8232a4dbf4d69d3d8496b568a03c56becac43e1808",
      "filename": "markupsafe-3.0.4-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl",
      "size": 22961,
      "sourceURL": "wheel:linux-x64-transformers-cuda/markupsafe-3.0.4-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl"
    },
    "382b219de3d436de3baba0f4b0c6d4336e8f5858d0eb047918b13b69a71c6c55": {
      "sha256": "382b219de3d436de3baba0f4b0c6d4336e8f5858d0eb047918b13b69a71c6c55",
      "filename": "msgpack-1.2.3-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl",
      "size": 477820,
      "sourceURL": "wheel:linux-x64-transformers-cuda/msgpack-1.2.3-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl"
    },
    "70d715680e33c48a8066a8588a52149d98644cddae1b5127cc5660c6418c81ce": {
      "sha256": "70d715680e33c48a8066a8588a52149d98644cddae1b5127cc5660c6418c81ce",
      "filename": "nagisa-0.2.11-cp311-cp311-manylinux_2_5_x86_64.manylinux1_x86_64.manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
      "size": 21678750,
      "sourceURL": "wheel:linux-x64-transformers-cuda/nagisa-0.2.11-cp311-cp311-manylinux_2_5_x86_64.manylinux1_x86_64.manylinux_2_17_x86_64.manylinux2014_x86_64.whl"
    },
    "68f92839637a2aaca8ae124c3abf91f648d2fade50953ea8e81ec604ac05a771": {
      "sha256": "68f92839637a2aaca8ae124c3abf91f648d2fade50953ea8e81ec604ac05a771",
      "filename": "numba-0.68.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl",
      "size": 3834537,
      "sourceURL": "wheel:linux-x64-transformers-cuda/numba-0.68.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl"
    },
    "9caf3d09f47c3c70c4451ada20ef9bc4a4cdffa26f49862cf0a253b329aae2d5": {
      "sha256": "9caf3d09f47c3c70c4451ada20ef9bc4a4cdffa26f49862cf0a253b329aae2d5",
      "filename": "orjson-3.12.0-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
      "size": 131285,
      "sourceURL": "wheel:linux-x64-transformers-cuda/orjson-3.12.0-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl"
    },
    "47121f9571503f724c9b93e297ab6254ac99c77adf5e9ed085ea419fd585c258": {
      "sha256": "47121f9571503f724c9b93e297ab6254ac99c77adf5e9ed085ea419fd585c258",
      "filename": "pandas-3.0.6-cp311-cp311-manylinux_2_24_x86_64.manylinux_2_28_x86_64.whl",
      "size": 11108900,
      "sourceURL": "wheel:linux-x64-transformers-cuda/pandas-3.0.6-cp311-cp311-manylinux_2_24_x86_64.manylinux_2_28_x86_64.whl"
    },
    "23d27a3e0307ec2244cc51e7287b919aa68d097504ebe19df4e76a98a3eea5bd": {
      "sha256": "23d27a3e0307ec2244cc51e7287b919aa68d097504ebe19df4e76a98a3eea5bd",
      "filename": "pillow-12.3.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl",
      "size": 6934408,
      "sourceURL": "wheel:linux-x64-transformers-cuda/pillow-12.3.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl"
    },
    "076a2d2f923fd4821644f5ba89f059523da90dc9014e85f8e45a5774ca5bc6f9": {
      "sha256": "076a2d2f923fd4821644f5ba89f059523da90dc9014e85f8e45a5774ca5bc6f9",
      "filename": "psutil-7.2.2-cp36-abi3-manylinux2010_x86_64.manylinux_2_12_x86_64.manylinux_2_28_x86_64.whl",
      "size": 155560,
      "sourceURL": "wheel:linux-x64-transformers-cuda/psutil-7.2.2-cp36-abi3-manylinux2010_x86_64.manylinux_2_12_x86_64.manylinux_2_28_x86_64.whl"
    },
    "49776eab08766a08dfff7012f8b422dcd7e25e43b316eedf0477c24fcfa84b7c": {
      "sha256": "49776eab08766a08dfff7012f8b422dcd7e25e43b316eedf0477c24fcfa84b7c",
      "filename": "pydantic_core-2.46.5-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
      "size": 2062091,
      "sourceURL": "wheel:linux-x64-transformers-cuda/pydantic_core-2.46.5-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl"
    },
    "b8bb0864c5a28024fac8a632c443c87c5aa6f215c0b126c449ae1a150412f31d": {
      "sha256": "b8bb0864c5a28024fac8a632c443c87c5aa6f215c0b126c449ae1a150412f31d",
      "filename": "pyyaml-6.0.3-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl",
      "size": 806638,
      "sourceURL": "wheel:linux-x64-transformers-cuda/pyyaml-6.0.3-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl"
    },
    "612b709381c0355b70d89cdb51b7f670591ed5cbbc0e3b5337488019dc667b65": {
      "sha256": "612b709381c0355b70d89cdb51b7f670591ed5cbbc0e3b5337488019dc667b65",
      "filename": "regex-2026.9.29-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl",
      "size": 804978,
      "sourceURL": "wheel:linux-x64-transformers-cuda/regex-2026.9.29-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl"
    },
    "fd6f3f93c9a0a7cc2788ee63fb763353d4bd2e89b0751bc78fcf7dda00bea774": {
      "sha256": "fd6f3f93c9a0a7cc2788ee63fb763353d4bd2e89b0751bc78fcf7dda00bea774",
      "filename": "safetensors-0.8.0-cp310-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
      "size": 516040,
      "sourceURL": "wheel:linux-x64-transformers-cuda/safetensors-0.8.0-cp310-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl"
    },
    "52a0703bbc07ad27f560fa63fa68e4c54dd735bfbbf65b4dd3c225dc7547b6df": {
      "sha256": "52a0703bbc07ad27f560fa63fa68e4c54dd735bfbbf65b4dd3c225dc7547b6df",
      "filename": "scikit_learn-1.9.1-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl",
      "size": 9315422,
      "sourceURL": "wheel:linux-x64-transformers-cuda/scikit_learn-1.9.1-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl"
    },
    "43af8d1f3bea642559019edfe64e9b11192a8978efbd1539d7bc2aaa23d92de4": {
      "sha256": "43af8d1f3bea642559019edfe64e9b11192a8978efbd1539d7bc2aaa23d92de4",
      "filename": "scipy-1.17.1-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl",
      "size": 35349300,
      "sourceURL": "wheel:linux-x64-transformers-cuda/scipy-1.17.1-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl"
    },
    "1e38bac1853412871318e82a1ba69a8be677619b56025bbfcccdb41b6cafe82d": {
      "sha256": "1e38bac1853412871318e82a1ba69a8be677619b56025bbfcccdb41b6cafe82d",
      "filename": "soundfile-0.14.0-py2.py3-none-manylinux_2_28_x86_64.whl",
      "size": 1315963,
      "sourceURL": "wheel:linux-x64-transformers-cuda/soundfile-0.14.0-py2.py3-none-manylinux_2_28_x86_64.whl"
    },
    "3da87e3ffa3e41823d873b051c7ecb2acebd8d1b6b46b752f5facf10a0d84ab9": {
      "sha256": "3da87e3ffa3e41823d873b051c7ecb2acebd8d1b6b46b752f5facf10a0d84ab9",
      "filename": "soxr-1.1.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl",
      "size": 245268,
      "sourceURL": "wheel:linux-x64-transformers-cuda/soxr-1.1.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl"
    },
    "369cc9fc8cc10cb24143873a0d95438bb8ee257bb80c71989e3ee290e8d72c67": {
      "sha256": "369cc9fc8cc10cb24143873a0d95438bb8ee257bb80c71989e3ee290e8d72c67",
      "filename": "tokenizers-0.22.2-cp39-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl",
      "size": 3274982,
      "sourceURL": "wheel:linux-x64-transformers-cuda/tokenizers-0.22.2-cp39-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl"
    },
    "039b9dcdd6bdbaa10a8a5cd6be22c4cb3e3589a341e5f904cbb571ca28f55bed": {
      "sha256": "039b9dcdd6bdbaa10a8a5cd6be22c4cb3e3589a341e5f904cbb571ca28f55bed",
      "filename": "torch-2.8.0+cu128-cp311-cp311-manylinux_2_28_x86_64.whl",
      "size": 889185760,
      "sourceURL": "wheel:linux-x64-transformers-cuda/torch-2.8.0+cu128-cp311-cp311-manylinux_2_28_x86_64.whl"
    },
    "8ac4e771d5a348c551b2a426eda6193c19aa630236b418086020df5ba9667142": {
      "sha256": "8ac4e771d5a348c551b2a426eda6193c19aa630236b418086020df5ba9667142",
      "filename": "nvidia_cublas_cu12-12.8.4.1-py3-none-manylinux_2_27_x86_64.whl",
      "size": 594346921,
      "sourceURL": "wheel:linux-x64-transformers-cuda/nvidia_cublas_cu12-12.8.4.1-py3-none-manylinux_2_27_x86_64.whl"
    },
    "ea0cb07ebda26bb9b29ba82cda34849e73c166c18162d3913575b0c9db9a6182": {
      "sha256": "ea0cb07ebda26bb9b29ba82cda34849e73c166c18162d3913575b0c9db9a6182",
      "filename": "nvidia_cuda_cupti_cu12-12.8.90-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
      "size": 10248621,
      "sourceURL": "wheel:linux-x64-transformers-cuda/nvidia_cuda_cupti_cu12-12.8.90-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
    },
    "a7756528852ef889772a84c6cd89d41dfa74667e24cca16bb31f8f061e3e9994": {
      "sha256": "a7756528852ef889772a84c6cd89d41dfa74667e24cca16bb31f8f061e3e9994",
      "filename": "nvidia_cuda_nvrtc_cu12-12.8.93-py3-none-manylinux2010_x86_64.manylinux_2_12_x86_64.whl",
      "size": 88040029,
      "sourceURL": "wheel:linux-x64-transformers-cuda/nvidia_cuda_nvrtc_cu12-12.8.93-py3-none-manylinux2010_x86_64.manylinux_2_12_x86_64.whl"
    },
    "adade8dcbd0edf427b7204d480d6066d33902cab2a4707dcfc48a2d0fd44ab90": {
      "sha256": "adade8dcbd0edf427b7204d480d6066d33902cab2a4707dcfc48a2d0fd44ab90",
      "filename": "nvidia_cuda_runtime_cu12-12.8.90-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
      "size": 954765,
      "sourceURL": "wheel:linux-x64-transformers-cuda/nvidia_cuda_runtime_cu12-12.8.90-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
    },
    "949452be657fa16687d0930933f032835951ef0892b37d2d53824d1a84dc97a8": {
      "sha256": "949452be657fa16687d0930933f032835951ef0892b37d2d53824d1a84dc97a8",
      "filename": "nvidia_cudnn_cu12-9.10.2.21-py3-none-manylinux_2_27_x86_64.whl",
      "size": 706758467,
      "sourceURL": "wheel:linux-x64-transformers-cuda/nvidia_cudnn_cu12-9.10.2.21-py3-none-manylinux_2_27_x86_64.whl"
    },
    "4d2dd21ec0b88cf61b62e6b43564355e5222e4a3fb394cac0db101f2dd0d4f74": {
      "sha256": "4d2dd21ec0b88cf61b62e6b43564355e5222e4a3fb394cac0db101f2dd0d4f74",
      "filename": "nvidia_cufft_cu12-11.3.3.83-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
      "size": 193118695,
      "sourceURL": "wheel:linux-x64-transformers-cuda/nvidia_cufft_cu12-11.3.3.83-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
    },
    "1d069003be650e131b21c932ec3d8969c1715379251f8d23a1860554b1cb24fc": {
      "sha256": "1d069003be650e131b21c932ec3d8969c1715379251f8d23a1860554b1cb24fc",
      "filename": "nvidia_cufile_cu12-1.13.1.3-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
      "size": 1197834,
      "sourceURL": "wheel:linux-x64-transformers-cuda/nvidia_cufile_cu12-1.13.1.3-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
    },
    "b32331d4f4df5d6eefa0554c565b626c7216f87a06a4f56fab27c3b68a830ec9": {
      "sha256": "b32331d4f4df5d6eefa0554c565b626c7216f87a06a4f56fab27c3b68a830ec9",
      "filename": "nvidia_curand_cu12-10.3.9.90-py3-none-manylinux_2_27_x86_64.whl",
      "size": 63619976,
      "sourceURL": "wheel:linux-x64-transformers-cuda/nvidia_curand_cu12-10.3.9.90-py3-none-manylinux_2_27_x86_64.whl"
    },
    "4376c11ad263152bd50ea295c05370360776f8c3427b30991df774f9fb26c450": {
      "sha256": "4376c11ad263152bd50ea295c05370360776f8c3427b30991df774f9fb26c450",
      "filename": "nvidia_cusolver_cu12-11.7.3.90-py3-none-manylinux_2_27_x86_64.whl",
      "size": 267506905,
      "sourceURL": "wheel:linux-x64-transformers-cuda/nvidia_cusolver_cu12-11.7.3.90-py3-none-manylinux_2_27_x86_64.whl"
    },
    "f1bb701d6b930d5a7cea44c19ceb973311500847f81b634d802b7b539dc55623": {
      "sha256": "f1bb701d6b930d5a7cea44c19ceb973311500847f81b634d802b7b539dc55623",
      "filename": "nvidia_cusparselt_cu12-0.7.1-py3-none-manylinux2014_x86_64.whl",
      "size": 287193691,
      "sourceURL": "wheel:linux-x64-transformers-cuda/nvidia_cusparselt_cu12-0.7.1-py3-none-manylinux2014_x86_64.whl"
    },
    "1ec05d76bbbd8b61b06a80e1eaf8cf4959c3d4ce8e711b65ebd0443bb0ebb13b": {
      "sha256": "1ec05d76bbbd8b61b06a80e1eaf8cf4959c3d4ce8e711b65ebd0443bb0ebb13b",
      "filename": "nvidia_cusparse_cu12-12.5.8.93-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
      "size": 288216466,
      "sourceURL": "wheel:linux-x64-transformers-cuda/nvidia_cusparse_cu12-12.5.8.93-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
    },
    "adf27ccf4238253e0b826bce3ff5fa532d65fc42322c8bfdfaf28024c0fbe039": {
      "sha256": "adf27ccf4238253e0b826bce3ff5fa532d65fc42322c8bfdfaf28024c0fbe039",
      "filename": "nvidia_nccl_cu12-2.27.3-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
      "size": 322364134,
      "sourceURL": "wheel:linux-x64-transformers-cuda/nvidia_nccl_cu12-2.27.3-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
    },
    "81ff63371a7ebd6e6451970684f916be2eab07321b73c9d244dc2b4da7f73b88": {
      "sha256": "81ff63371a7ebd6e6451970684f916be2eab07321b73c9d244dc2b4da7f73b88",
      "filename": "nvidia_nvjitlink_cu12-12.8.93-py3-none-manylinux2010_x86_64.manylinux_2_12_x86_64.whl",
      "size": 39254836,
      "sourceURL": "wheel:linux-x64-transformers-cuda/nvidia_nvjitlink_cu12-12.8.93-py3-none-manylinux2010_x86_64.manylinux_2_12_x86_64.whl"
    },
    "5b17e2001cc0d751a5bc2c6ec6d26ad95913324a4adb86788c944f8ce9ba441f": {
      "sha256": "5b17e2001cc0d751a5bc2c6ec6d26ad95913324a4adb86788c944f8ce9ba441f",
      "filename": "nvidia_nvtx_cu12-12.8.90-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
      "size": 89954,
      "sourceURL": "wheel:linux-x64-transformers-cuda/nvidia_nvtx_cu12-12.8.90-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl"
    },
    "51a52592b3b99e102b609654876bd65f19f999935166d1352678931132b0c670": {
      "sha256": "51a52592b3b99e102b609654876bd65f19f999935166d1352678931132b0c670",
      "filename": "setuptools-84.0.0-py3-none-any.whl",
      "size": 818216,
      "sourceURL": "wheel:linux-x64-transformers-cuda/setuptools-84.0.0-py3-none-any.whl"
    },
    "7b70f5e6a41e52e48cfc087436c8a28c17ff98db369447bcaff3b887a3ab4467": {
      "sha256": "7b70f5e6a41e52e48cfc087436c8a28c17ff98db369447bcaff3b887a3ab4467",
      "filename": "triton-3.4.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl",
      "size": 155531138,
      "sourceURL": "wheel:linux-x64-transformers-cuda/triton-3.4.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl"
    },
    "2238f0556d3a9777d42261b1e4d7b9834d56f111d3dd879a0647c27c824cc31d": {
      "sha256": "2238f0556d3a9777d42261b1e4d7b9834d56f111d3dd879a0647c27c824cc31d",
      "filename": "cpython-3.11.17+20261003-aarch64-unknown-linux-gnu-install_only.tar.gz",
      "size": 48957743,
      "sourceURL": "https://github.com/astral-sh/python-build-standalone/releases/download/20261003/cpython-3.11.17%2B20261003-aarch64-unknown-linux-gnu-install_only.tar.gz"
    },
    "b64d8d4d17135e00c8e346e0a738deb17e754230d7e0810ac5012750bbd85a5a": {
      "sha256": "b64d8d4d17135e00c8e346e0a738deb17e754230d7e0810ac5012750bbd85a5a",
      "filename": "numpy-2.2.6-cp311-cp311-manylinux_2_17_aarch64.manylinux2014_aarch64.whl",
      "size": 14312005,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/numpy-2.2.6-cp311-cp311-manylinux_2_17_aarch64.manylinux2014_aarch64.whl"
    },
    "b56808d19a79368dcaa507d02a4c1ce537ca713fab9fedd91256b4ec599c6bf7": {
      "sha256": "b56808d19a79368dcaa507d02a4c1ce537ca713fab9fedd91256b4ec599c6bf7",
      "filename": "sherpa_onnx-1.13.8-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.whl",
      "size": 4177610,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/sherpa_onnx-1.13.8-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.whl"
    },
    "a51a03d55c376c32e15dd63ea852236042ba91a5cd73e253bbf7cf21f6582ba9": {
      "sha256": "a51a03d55c376c32e15dd63ea852236042ba91a5cd73e253bbf7cf21f6582ba9",
      "filename": "sherpa_onnx_core-1.13.8-py3-none-manylinux2014_aarch64.whl",
      "size": 13353426,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/sherpa_onnx_core-1.13.8-py3-none-manylinux2014_aarch64.whl"
    },
    "680129efdeeec3db5da3f88ee5d28c1b1e103b774aef40f9d638e2cce8f8d8d8": {
      "sha256": "680129efdeeec3db5da3f88ee5d28c1b1e103b774aef40f9d638e2cce8f8d8d8",
      "filename": "torch-2.8.0+cpu-cp311-cp311-manylinux_2_28_aarch64.whl",
      "size": 102073276,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/torch-2.8.0+cpu-cp311-cp311-manylinux_2_28_aarch64.whl"
    },
    "6fc837cc51adf80331ac850779cd53b5d4c4460b0ebe9057a02a921c6736f19d": {
      "sha256": "6fc837cc51adf80331ac850779cd53b5d4c4460b0ebe9057a02a921c6736f19d",
      "filename": "av-18.1.0-cp311-abi3-manylinux_2_28_aarch64.whl",
      "size": 33640142,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/av-18.1.0-cp311-abi3-manylinux_2_28_aarch64.whl"
    },
    "350c8348f0e76fff0a0fd6c26755d2653863279d086d3aa2c290a6a7251135dd": {
      "sha256": "350c8348f0e76fff0a0fd6c26755d2653863279d086d3aa2c290a6a7251135dd",
      "filename": "brotli-1.2.0-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl",
      "size": 1534420,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/brotli-1.2.0-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl"
    },
    "3311ed60d36f83378794e1009ac6258bafbf81f7888b4caa7b35a521e3f95813": {
      "sha256": "3311ed60d36f83378794e1009ac6258bafbf81f7888b4caa7b35a521e3f95813",
      "filename": "cffi-2.1.1-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.whl",
      "size": 218716,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/cffi-2.1.1-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.whl"
    },
    "d760fe2a4d7c3b226cb9026d6a842868d52a7901bd98420e1baf14e80da85cf5": {
      "sha256": "d760fe2a4d7c3b226cb9026d6a842868d52a7901bd98420e1baf14e80da85cf5",
      "filename": "charset_normalizer-3.5.2-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl",
      "size": 259280,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/charset_normalizer-3.5.2-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl"
    },
    "11e437f086affee8051cec4bb531be3edb646ab66e325154aa6849377f365033": {
      "sha256": "11e437f086affee8051cec4bb531be3edb646ab66e325154aa6849377f365033",
      "filename": "cython-3.3.0-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl",
      "size": 3346108,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/cython-3.3.0-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl"
    },
    "313799701f7e44cbfaff98a88f1373beef9be57aa340e7e986238673de7d9173": {
      "sha256": "313799701f7e44cbfaff98a88f1373beef9be57aa340e7e986238673de7d9173",
      "filename": "dyNET38-2.2-cp311-cp311-manylinux_2_17_aarch64.manylinux2014_aarch64.whl",
      "size": 6510091,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/dyNET38-2.2-cp311-cp311-manylinux_2_17_aarch64.manylinux2014_aarch64.whl"
    },
    "0e6e21fa3cdfcdcd76748564bf593870a5e013f47d97cf10aed63aa222cff5b7": {
      "sha256": "0e6e21fa3cdfcdcd76748564bf593870a5e013f47d97cf10aed63aa222cff5b7",
      "filename": "hf_xet-1.6.0-cp38-abi3-manylinux_2_28_aarch64.whl",
      "size": 4262538,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/hf_xet-1.6.0-cp38-abi3-manylinux_2_28_aarch64.whl"
    },
    "0225351ad77ea30501fc5b4c09ff6868169fde50c5a576cdfda1645091157616": {
      "sha256": "0225351ad77ea30501fc5b4c09ff6868169fde50c5a576cdfda1645091157616",
      "filename": "llvmlite-0.50.0-cp311-cp311-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl",
      "size": 58344485,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/llvmlite-0.50.0-cp311-cp311-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl"
    },
    "849dd2bb0e5e4ab2b71c7191726a4a8d5aa8a610daa584728cbee0b710ddc4ef": {
      "sha256": "849dd2bb0e5e4ab2b71c7191726a4a8d5aa8a610daa584728cbee0b710ddc4ef",
      "filename": "markupsafe-3.0.4-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl",
      "size": 24321,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/markupsafe-3.0.4-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl"
    },
    "6707d2fa2aa1bb5424ea0b05f44ffc989b15ab41a73ff5855bff4944fec7c8ac": {
      "sha256": "6707d2fa2aa1bb5424ea0b05f44ffc989b15ab41a73ff5855bff4944fec7c8ac",
      "filename": "msgpack-1.2.3-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl",
      "size": 465347,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/msgpack-1.2.3-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl"
    },
    "53a9b7dbe925db6a8e9347f85718a72d4ebed8ffe2542af709229b48e505f965": {
      "sha256": "53a9b7dbe925db6a8e9347f85718a72d4ebed8ffe2542af709229b48e505f965",
      "filename": "nagisa-0.2.11-cp311-cp311-manylinux_2_17_aarch64.manylinux2014_aarch64.whl",
      "size": 21671530,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/nagisa-0.2.11-cp311-cp311-manylinux_2_17_aarch64.manylinux2014_aarch64.whl"
    },
    "954e2684bca3ea11235272df28e8ef40f18a682c1c635a2398032b404675d8fa": {
      "sha256": "954e2684bca3ea11235272df28e8ef40f18a682c1c635a2398032b404675d8fa",
      "filename": "numba-0.68.0-cp311-cp311-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl",
      "size": 3547920,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/numba-0.68.0-cp311-cp311-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl"
    },
    "dce0166feb0a737ab84f598c9a338cbc0b764a036617aa686194f53c7eba0c3e": {
      "sha256": "dce0166feb0a737ab84f598c9a338cbc0b764a036617aa686194f53c7eba0c3e",
      "filename": "orjson-3.12.0-cp311-cp311-manylinux_2_17_aarch64.manylinux2014_aarch64.whl",
      "size": 130891,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/orjson-3.12.0-cp311-cp311-manylinux_2_17_aarch64.manylinux2014_aarch64.whl"
    },
    "1e7c0afdcaf6661d795fcefc2f647ddd1136f62cdc153fba177c685d97a87808": {
      "sha256": "1e7c0afdcaf6661d795fcefc2f647ddd1136f62cdc153fba177c685d97a87808",
      "filename": "pandas-3.0.6-cp311-cp311-manylinux_2_24_aarch64.manylinux_2_28_aarch64.whl",
      "size": 10612800,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/pandas-3.0.6-cp311-cp311-manylinux_2_24_aarch64.manylinux_2_28_aarch64.whl"
    },
    "bcb46e2f9feff8d06323983bd83ed00c201fdcab3d74973e7072a889b3979fcd": {
      "sha256": "bcb46e2f9feff8d06323983bd83ed00c201fdcab3d74973e7072a889b3979fcd",
      "filename": "pillow-12.3.0-cp311-cp311-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl",
      "size": 6263814,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/pillow-12.3.0-cp311-cp311-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl"
    },
    "b0726cecd84f9474419d67252add4ac0cd9811b04d61123054b9fb6f57df6e9e": {
      "sha256": "b0726cecd84f9474419d67252add4ac0cd9811b04d61123054b9fb6f57df6e9e",
      "filename": "psutil-7.2.2-cp36-abi3-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl",
      "size": 156997,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/psutil-7.2.2-cp36-abi3-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl"
    },
    "4f8507560a9284e1370bb048ed4282012fbef4e8d109875b95e884d228552061": {
      "sha256": "4f8507560a9284e1370bb048ed4282012fbef4e8d109875b95e884d228552061",
      "filename": "pydantic_core-2.46.5-cp311-cp311-manylinux_2_17_aarch64.manylinux2014_aarch64.whl",
      "size": 1948231,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/pydantic_core-2.46.5-cp311-cp311-manylinux_2_17_aarch64.manylinux2014_aarch64.whl"
    },
    "10892704fc220243f5305762e276552a0395f7beb4dbf9b14ec8fd43b57f126c": {
      "sha256": "10892704fc220243f5305762e276552a0395f7beb4dbf9b14ec8fd43b57f126c",
      "filename": "pyyaml-6.0.3-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl",
      "size": 775556,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/pyyaml-6.0.3-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl"
    },
    "7020ed44df30b3aa492c00ee3b52d0548c1f30c2c6c5bb13ae897680900d3413": {
      "sha256": "7020ed44df30b3aa492c00ee3b52d0548c1f30c2c6c5bb13ae897680900d3413",
      "filename": "regex-2026.9.29-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl",
      "size": 799537,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/regex-2026.9.29-cp311-cp311-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl"
    },
    "7a46e5ff292c356d6991e60942ba7f79817682d3a2cef0702136448cb9c4d235": {
      "sha256": "7a46e5ff292c356d6991e60942ba7f79817682d3a2cef0702136448cb9c4d235",
      "filename": "safetensors-0.8.0-cp310-abi3-manylinux_2_17_aarch64.manylinux2014_aarch64.whl",
      "size": 502844,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/safetensors-0.8.0-cp310-abi3-manylinux_2_17_aarch64.manylinux2014_aarch64.whl"
    },
    "4298fcc01b3d8fa9768d36894e99cce0747b3b2dd73bfd80779e393769d0afab": {
      "sha256": "4298fcc01b3d8fa9768d36894e99cce0747b3b2dd73bfd80779e393769d0afab",
      "filename": "scikit_learn-1.9.1-cp311-cp311-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl",
      "size": 9026402,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/scikit_learn-1.9.1-cp311-cp311-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl"
    },
    "744b2bf3640d907b79f3fd7874efe432d1cf171ee721243e350f55234b4cec4c": {
      "sha256": "744b2bf3640d907b79f3fd7874efe432d1cf171ee721243e350f55234b4cec4c",
      "filename": "scipy-1.17.1-cp311-cp311-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl",
      "size": 33062057,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/scipy-1.17.1-cp311-cp311-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl"
    },
    "e85724a90bc99a6e8062c0b4ddf725f53b2a3b70afd4da875e9d2cfc4e92f377": {
      "sha256": "e85724a90bc99a6e8062c0b4ddf725f53b2a3b70afd4da875e9d2cfc4e92f377",
      "filename": "soundfile-0.14.0-py2.py3-none-manylinux_2_28_aarch64.whl",
      "size": 1238050,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/soundfile-0.14.0-py2.py3-none-manylinux_2_28_aarch64.whl"
    },
    "1577865e993f98ffb261257c3060fa76ec3db44ed3f181b16464268000424464": {
      "sha256": "1577865e993f98ffb261257c3060fa76ec3db44ed3f181b16464268000424464",
      "filename": "soxr-1.1.0-cp311-cp311-manylinux_2_26_aarch64.manylinux_2_28_aarch64.whl",
      "size": 210938,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/soxr-1.1.0-cp311-cp311-manylinux_2_26_aarch64.manylinux_2_28_aarch64.whl"
    },
    "2249487018adec45d6e3554c71d46eb39fa8ea67156c640f7513eb26f318cec7": {
      "sha256": "2249487018adec45d6e3554c71d46eb39fa8ea67156c640f7513eb26f318cec7",
      "filename": "tokenizers-0.22.2-cp39-abi3-manylinux_2_17_aarch64.manylinux2014_aarch64.whl",
      "size": 3290736,
      "sourceURL": "wheel:linux-arm64-transformers-cpu/tokenizers-0.22.2-cp39-abi3-manylinux_2_17_aarch64.manylinux2014_aarch64.whl"
    },
    "daf24de7fb3b173e94e56a201d3f38dfedebbdc7ed1925f7aeb8ed588e2b4189": {
      "sha256": "daf24de7fb3b173e94e56a201d3f38dfedebbdc7ed1925f7aeb8ed588e2b4189",
      "filename": "python-3.11.9-embed-win32.zip",
      "size": 10113050,
      "sourceURL": "https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-win32.zip"
    },
    "1af303d6b2210eb850fcf03064d364652b7120803a0b872f5211f5234b399f20": {
      "sha256": "1af303d6b2210eb850fcf03064d364652b7120803a0b872f5211f5234b399f20",
      "filename": "numpy-1.26.4-cp311-cp311-win32.whl",
      "size": 5968812,
      "sourceURL": "wheel:win32-ia32-onnx-cpu/numpy-1.26.4-cp311-cp311-win32.whl"
    },
    "3b25da29441b20b1b967ef1cac7834258b23c5c1baa8f26a1269debd384b79b5": {
      "sha256": "3b25da29441b20b1b967ef1cac7834258b23c5c1baa8f26a1269debd384b79b5",
      "filename": "sherpa-onnx-v1.13.8-win-x86-shared-MT-Release-no-tts.tar.bz2",
      "size": 19795683,
      "sourceURL": "https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.8/sherpa-onnx-v1.13.8-win-x86-shared-MT-Release-no-tts.tar.bz2"
    },
    "2e63e9a38b6e8fc0c7bc37ce174caca1862870856c6daf5697cfb785e925520b": {
      "sha256": "2e63e9a38b6e8fc0c7bc37ce174caca1862870856c6daf5697cfb785e925520b",
      "filename": "silero-vad-LICENSE.txt",
      "size": 1075,
      "sourceURL": "https://raw.githubusercontent.com/snakers4/silero-vad/master/LICENSE"
    },
    "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4": {
      "sha256": "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4",
      "filename": "3D-Speaker-LICENSE.txt",
      "size": 11357,
      "sourceURL": "https://raw.githubusercontent.com/modelscope/3D-Speaker/main/LICENSE"
    },
    "f382b62dcc61fc566b9215b1e3b604b539bfd96ed52ae1eeff5090f6dc176057": {
      "sha256": "f382b62dcc61fc566b9215b1e3b604b539bfd96ed52ae1eeff5090f6dc176057",
      "filename": "FunASR-LICENSE.txt",
      "size": 1061,
      "sourceURL": "https://raw.githubusercontent.com/modelscope/FunASR/main/LICENSE"
    },
    "4bc3bffe14ebe38cc67309991e04f92866835eac1c5e2e1abd37163f67c6de5f": {
      "sha256": "4bc3bffe14ebe38cc67309991e04f92866835eac1c5e2e1abd37163f67c6de5f",
      "filename": "SenseVoice-LICENSE.txt",
      "size": 1062,
      "sourceURL": "https://raw.githubusercontent.com/FunAudioLLM/SenseVoice/main/LICENSE"
    },
    "a44a6081c73ad75f0255bb2bb5cab74ef1829565a895a24e53a4f11290ab7655": {
      "sha256": "a44a6081c73ad75f0255bb2bb5cab74ef1829565a895a24e53a4f11290ab7655",
      "filename": "Qwen3-ASR-LICENSE.txt",
      "size": 11343,
      "sourceURL": "https://raw.githubusercontent.com/QwenLM/Qwen3-ASR/main/LICENSE"
    },
    "5058416891bc47a2051557765997e8c42f8eb78a0e33c3e775bd17d4b0ba4d50": {
      "sha256": "5058416891bc47a2051557765997e8c42f8eb78a0e33c3e775bd17d4b0ba4d50",
      "filename": "README.md",
      "size": 57456,
      "sourceURL": "https://huggingface.co/Qwen/Qwen3-ASR-1.7B/resolve/7278e1e70fe206f11671096ffdd38061171dd6e5/README.md"
    }
  }
};
