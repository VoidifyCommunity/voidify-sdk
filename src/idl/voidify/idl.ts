/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/voidify.json`.
 */
export type Voidify = {
  "address": "",
  "metadata": {
    "name": "voidify",
    "version": "2.0.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "deposit",
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "sender",
          "writable": true,
          "signer": true
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "pool.denomination",
                "account": "pool"
              }
            ]
          }
        },
        {
          "name": "poolTreasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "commitmentAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  109,
                  109,
                  105,
                  116,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "commitment"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "commitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "directWithdraw",
      "discriminator": [
        136,
        23,
        192,
        118,
        222,
        36,
        109,
        50
      ],
      "accounts": [
        {
          "name": "sender",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasuryConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "pool.denomination",
                "account": "pool"
              }
            ]
          }
        },
        {
          "name": "poolTreasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "recipient",
          "writable": true
        },
        {
          "name": "treasurySolDestination",
          "writable": true
        },
        {
          "name": "nullifierAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  110,
                  117,
                  108,
                  108,
                  105,
                  102,
                  105,
                  101,
                  114
                ]
              },
              {
                "kind": "arg",
                "path": "nullifierHash"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "proof",
          "type": {
            "array": [
              "u8",
              256
            ]
          }
        },
        {
          "name": "root",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "nullifierHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "fee",
          "type": "u64"
        },
        {
          "name": "treasury",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdraw",
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "relayer",
          "writable": true,
          "signer": true
        },
        {
          "name": "relayerConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "relayer"
              }
            ]
          }
        },
        {
          "name": "relayerStake",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  115,
                  116,
                  97,
                  107,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "relayer"
              }
            ]
          }
        },
        {
          "name": "relayerEventCounter",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  99,
                  111,
                  117,
                  110,
                  116,
                  101,
                  114
                ]
              }
            ]
          }
        },
        {
          "name": "coreConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  114,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "stakeConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "stakeTokenMint"
        },
        {
          "name": "treasuryConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "oracleConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "relayerStakeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  108,
                  97,
                  121,
                  101,
                  114,
                  45,
                  115,
                  116,
                  97,
                  107,
                  101,
                  45,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "relayer"
              }
            ]
          }
        },
        {
          "name": "stakingRewardVault",
          "writable": true
        },
        {
          "name": "treasuryTokenAccount",
          "writable": true
        },
        {
          "name": "switchboardQuote"
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "pool.denomination",
                "account": "pool"
              }
            ]
          }
        },
        {
          "name": "poolTreasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "recipient",
          "writable": true
        },
        {
          "name": "nullifierAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  110,
                  117,
                  108,
                  108,
                  105,
                  102,
                  105,
                  101,
                  114
                ]
              },
              {
                "kind": "arg",
                "path": "nullifierHash"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "proof",
          "type": {
            "array": [
              "u8",
              256
            ]
          }
        },
        {
          "name": "root",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "nullifierHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "fee",
          "type": "u64"
        },
        {
          "name": "treasury",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "oracleConfig",
      "discriminator": [
        133,
        196,
        152,
        50,
        27,
        21,
        145,
        254
      ]
    },
    {
      "name": "pool",
      "discriminator": [
        241,
        154,
        109,
        4,
        17,
        177,
        109,
        188
      ]
    },
    {
      "name": "relayerConfig",
      "discriminator": [
        116,
        239,
        42,
        132,
        218,
        154,
        194,
        20
      ]
    },
    {
      "name": "relayerEventCounter",
      "discriminator": [
        118,
        57,
        230,
        191,
        246,
        87,
        159,
        143
      ]
    },
    {
      "name": "stakeConfig",
      "discriminator": [
        238,
        151,
        43,
        3,
        11,
        151,
        63,
        176
      ]
    },
    {
      "name": "treasuryConfig",
      "discriminator": [
        124,
        54,
        212,
        227,
        213,
        189,
        168,
        41
      ]
    }
  ],
  "events": [
    {
      "name": "depositEvent",
      "discriminator": [
        120,
        248,
        61,
        83,
        31,
        142,
        107,
        144
      ]
    },
    {
      "name": "directWithdrawalEvent",
      "discriminator": [
        171,
        152,
        233,
        75,
        200,
        77,
        18,
        17
      ]
    },
    {
      "name": "relayerActivatedEvent",
      "discriminator": [
        194,
        184,
        115,
        231,
        144,
        82,
        243,
        243
      ]
    },
    {
      "name": "relayerDeactivatedEvent",
      "discriminator": [
        61,
        214,
        119,
        135,
        63,
        139,
        211,
        121
      ]
    },
    {
      "name": "relayerRegisteredEvent",
      "discriminator": [
        145,
        107,
        62,
        237,
        228,
        45,
        135,
        112
      ]
    },
    {
      "name": "relayerSlashedEvent",
      "discriminator": [
        26,
        12,
        143,
        166,
        17,
        87,
        146,
        7
      ]
    },
    {
      "name": "relayerUnregisteredEvent",
      "discriminator": [
        181,
        160,
        79,
        218,
        0,
        62,
        181,
        18
      ]
    },
    {
      "name": "relayerUpdatedEvent",
      "discriminator": [
        69,
        205,
        109,
        92,
        132,
        196,
        237,
        220
      ]
    },
    {
      "name": "withdrawalEvent",
      "discriminator": [
        161,
        53,
        185,
        18,
        98,
        254,
        54,
        165
      ]
    }
  ],
  "types": [
    {
      "name": "depositEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "depositor",
            "type": "pubkey"
          },
          {
            "name": "denomination",
            "type": "u64"
          },
          {
            "name": "commitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "index",
            "type": "u32"
          },
          {
            "name": "timestamp",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "directWithdrawalEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "denomination",
            "type": "u64"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "nullifierHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "sender",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "oracleConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "maxPriceAgeSecs",
            "type": "u64"
          },
          {
            "name": "switchboardFeedHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "pool",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "denomination",
            "type": "u64"
          },
          {
            "name": "merkleTree",
            "type": {
              "defined": {
                "name": "poseidonMerkleTree"
              }
            }
          }
        ]
      }
    },
    {
      "name": "poseidonMerkleTree",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "levels",
            "type": "u32"
          },
          {
            "name": "filledSubtrees",
            "type": {
              "vec": {
                "array": [
                  "u8",
                  32
                ]
              }
            }
          },
          {
            "name": "roots",
            "type": {
              "vec": {
                "array": [
                  "u8",
                  32
                ]
              }
            }
          },
          {
            "name": "currentRootIndex",
            "type": "u32"
          },
          {
            "name": "nextIndex",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "relayerActivatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "relayer",
            "type": "pubkey"
          },
          {
            "name": "stakeAmount",
            "type": "u64"
          },
          {
            "name": "index",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "relayerConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "relayer",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "url",
            "type": "string"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "relayerDeactivatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "relayer",
            "type": "pubkey"
          },
          {
            "name": "remainingStake",
            "type": "u64"
          },
          {
            "name": "index",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "relayerEventCounter",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "count",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "relayerRegisteredEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "relayer",
            "type": "pubkey"
          },
          {
            "name": "stakeAmount",
            "type": "u64"
          },
          {
            "name": "index",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "relayerSlashedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "relayer",
            "type": "pubkey"
          },
          {
            "name": "slashedAmount",
            "type": "u64"
          },
          {
            "name": "reason",
            "type": "string"
          },
          {
            "name": "index",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "relayerUnregisteredEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "relayer",
            "type": "pubkey"
          },
          {
            "name": "returnedAmount",
            "type": "u64"
          },
          {
            "name": "index",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "relayerUpdatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "relayer",
            "type": "pubkey"
          },
          {
            "name": "feeBps",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "url",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "addedAmount",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "index",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "stakeConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stakeTokenMint",
            "type": "pubkey"
          },
          {
            "name": "relayerDeactivationThreshold",
            "type": "u64"
          },
          {
            "name": "minRegisterStake",
            "type": "u64"
          },
          {
            "name": "totalRelayers",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "treasuryConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stakingRewardVault",
            "type": "pubkey"
          },
          {
            "name": "treasurySolAddress",
            "type": "pubkey"
          },
          {
            "name": "treasuryTokenAccount",
            "type": "pubkey"
          },
          {
            "name": "treasuryBps",
            "type": "u16"
          },
          {
            "name": "directWithdrawBps",
            "type": "u16"
          },
          {
            "name": "treasurySplitBps",
            "type": "u16"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "withdrawalEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "denomination",
            "type": "u64"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "nullifierHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "relayer",
            "type": "pubkey"
          },
          {
            "name": "fee",
            "type": "u64"
          },
          {
            "name": "treasury",
            "type": "u64"
          },
          {
            "name": "tokenDeducted",
            "type": "u64"
          },
          {
            "name": "index",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
