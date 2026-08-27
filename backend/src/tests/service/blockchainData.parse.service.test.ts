import {
  extractInputAddresses,
  extractRecipientOutputs,
  identifyChangeOutputIndices,
  parseBlockchainRawTx,
  satoshiToBtc,
  unixSecondsToDate,
} from "@blockchainData/parse";
import type { BlockchainRawTx } from "@blockchainData/types";

const CHANGE_ADDR = "bc1q4lcj82nqkhlcddf8z5yru5aepqfjypftguglgx";

/** Abbreviated fixture based on blockchain.info rawtx (25 outputs; change matches input addr). */
const SAMPLE_RAW_TX: BlockchainRawTx = {
  hash: "99c71c9f51a3b8a8b40151fba32192ea725941e7fabdded3b42b3f6c0931be1c",
  fee: 1493,
  time: 1779110105,
  inputs: [{ prev_out: { addr: CHANGE_ADDR, value: 2_000_000_000 } }],
  out: [
    { n: 0, value: 45923, addr: "bc1qq8kap8c2d48drtu929hc7v8d45c7c2ugw64ewl" },
    { n: 1, value: 45923, addr: "bc1qzmuu5x4v0t4wkgxxfuajyulejllctu4ncnv30n" },
    { n: 2, value: 45923, addr: "bc1qyjve8fwjgtuk9jqjxpgvyz67qg7lvjqezz4vxe" },
    { n: 3, value: 45923, addr: "bc1qxzsjf0kugyke35n668rln5jn8fcsq2325067hg" },
    { n: 4, value: 45923, addr: "bc1q8mr4n5aquss9435n5tu2hkf5z5srvxwawtqesn" },
    { n: 5, value: 45923, addr: "bc1q2zqf7puaq8w4aan5n56cewjx9davusz6nhdr9x" },
    { n: 6, value: 45923, addr: "bc1q2dg2yv7uevzeahqmlxd45v3dsvmvuwmslgyjtd" },
    { n: 7, value: 45923, addr: "bc1qdrjsmh2haqdyd6mfna6e5y35e9cxa6lftvdzea" },
    { n: 8, value: 45923, addr: "bc1qwwgeglhk6rzl96flmrwvgpyc3gfhut93rtrgzc" },
    { n: 9, value: 45923, addr: "bc1q5hhg4luf09th4grw4r63cnfqx9h9aq0d84jaju" },
    { n: 10, value: 45923, addr: "bc1qhmj5490uejzvun7e3es787d8q9vwnptpzv6rmw" },
    { n: 11, value: 45923, addr: "bc1qc4uppdnf6pyerh0pkavhyugkzr6eywqkxznqmw" },
    { n: 12, value: 45923, addr: "bc1q6qxnrn9tsjzks5rdmq255urkqvjkuyjfspxpk6" },
    { n: 13, value: 45923, addr: "bc1pxxq4v2u44ermxyta5y5f66asmvx98mkpx95l93hy9t3h3fdv3spsdwx0d6" },
    { n: 14, value: 45923, addr: "bc1pu3rpnze9t53tmuntzrzpdz7np3227kf5zct9s3m3rsavk9mw4yyq4dfdm3" },
    { n: 15, value: 91846, addr: "bc1qpcn2m89qg9mu4hjckggt4uktyukgapa8yg9wj5" },
    { n: 16, value: 91846, addr: "bc1qrvjrzwj6rwxfd736m9exchpdz872aplk4q9uey" },
    { n: 17, value: 91846, addr: "bc1q0wckuxkpmqd35y62j94z93zysjwe9q3mw9xvfg" },
    { n: 18, value: 91846, addr: "bc1qsx63hs5xavnly8r99hdpmu6sm33sqque5ctzlu" },
    { n: 19, value: 91846, addr: "bc1qsfh7k0npcqwjl23n58432zz7slhl5a29qm2jzn" },
    { n: 20, value: 91846, addr: "bc1qjczaamqxxkelqh6drt9ampq6y7tlxv2tm5xy27" },
    { n: 21, value: 91846, addr: "bc1qh98eukjxdz2nmtwmuggrffnu959c8dk3ztlxjz" },
    { n: 22, value: 137769, addr: "bc1qurdh656vv5qfuxqwr4w4ft975nwkj538d0hpep" },
    { n: 23, value: 275538, addr: "bc1qdksun4h46jzdvnhajx6kp7m2ljvn6vfr6jd4z4" },
    { n: 24, value: 1674882, addr: CHANGE_ADDR },
  ],
};

/** When change addr is not among outputs, keep all outputs (do not drop last by position). */
const LAST_IS_RECIPIENT_TX: BlockchainRawTx = {
  hash: "d7eddf16aa101f02faec0b2e1c7665e81f7126f7a3fee8969aa0e3f609237b7d",
  fee: 1898,
  time: 1779110105,
  inputs: [{ prev_out: { addr: "bc1qy4j78a6lz6aw4pkv2pkguppgpe7qnftx9afpzu", value: 1_000_000_000 } }],
  out: [
    { n: 0, value: 58433, addr: "bc1qq8kap8c2d48drtu929hc7v8d45c7c2ugw64ewl" },
    { n: 1, value: 58433, addr: "bc1qzmuu5x4v0t4wkgxxfuajyulejllctu4ncnv30n" },
    { n: 2, value: 331610, addr: "bc1qj2yk48h5kskq23txkwzdrfgjdpx9v06yprm0l7" },
    { n: 3, value: 350598, addr: "bc1qdksun4h46jzdvnhajx6kp7m2ljvn6vfr6jd4z4" },
  ],
};

describe("blockchainData.parse.service", () => {
  it("converts satoshis to BTC", () => {
    expect(satoshiToBtc(45923)).toBe(0.00045923);
    expect(satoshiToBtc(1493)).toBe(0.00001493);
  });

  it("converts unix seconds to Date", () => {
    const d = unixSecondsToDate(1779110105);
    expect(d.toISOString()).toBe("2026-05-18T13:15:05.000Z");
  });

  it("collects input addresses from prev_out", () => {
    const addrs = extractInputAddresses(SAMPLE_RAW_TX.inputs);
    expect(addrs.has(CHANGE_ADDR)).toBe(true);
    expect(addrs.size).toBe(1);
  });

  it("excludes change output when its address appears in inputs", () => {
    const recipients = extractRecipientOutputs(SAMPLE_RAW_TX.out, SAMPLE_RAW_TX.inputs);
    expect(recipients).toHaveLength(SAMPLE_RAW_TX.out.length - 1);
    expect(recipients[recipients.length - 1].address).toBe("bc1qdksun4h46jzdvnhajx6kp7m2ljvn6vfr6jd4z4");
    expect(recipients.some((r) => r.address === CHANGE_ADDR)).toBe(false);
  });

  it("keeps last output when it is a recipient (input addr not in outputs)", () => {
    const recipients = extractRecipientOutputs(LAST_IS_RECIPIENT_TX.out, LAST_IS_RECIPIENT_TX.inputs);
    expect(recipients).toHaveLength(4);
    expect(recipients.some((r) => r.address === "bc1qdksun4h46jzdvnhajx6kp7m2ljvn6vfr6jd4z4")).toBe(true);
  });

  it("identifies change by input address match, not output position", () => {
    const change = identifyChangeOutputIndices(SAMPLE_RAW_TX.out, extractInputAddresses(SAMPLE_RAW_TX.inputs));
    expect([...change]).toEqual([24]);
  });

  it("works for a smaller batch (excludes change by input addr)", () => {
    const smallTx: BlockchainRawTx = {
      hash: "a".repeat(64),
      fee: 500,
      time: 1779110105,
      inputs: [{ prev_out: { addr: "bc1qchange00000000000000000000000000000000", value: 1_000_000 } }],
      out: [
        { n: 0, value: 10000, addr: "bc1qrecipient0000000000000000000000000000a" },
        { n: 1, value: 20000, addr: "bc1qrecipient0000000000000000000000000000b" },
        { n: 2, value: 30000, addr: "bc1qrecipient0000000000000000000000000000c" },
        { n: 3, value: 999999, addr: "bc1qchange00000000000000000000000000000000" },
      ],
    };
    const recipients = extractRecipientOutputs(smallTx.out, smallTx.inputs);
    expect(recipients).toHaveLength(3);
    expect(recipients.some((r) => r.address === "bc1qchange00000000000000000000000000000000")).toBe(false);
  });

  it("parses full rawtx with fee, date, and gross total", () => {
    const parsed = parseBlockchainRawTx(SAMPLE_RAW_TX);
    expect(parsed.txid).toBe(SAMPLE_RAW_TX.hash);
    expect(parsed.txidFeeBtc).toBe(0.00001493);
    expect(parsed.txnDate.toISOString()).toBe("2026-05-18T13:15:05.000Z");
    expect(parsed.recipients).toHaveLength(SAMPLE_RAW_TX.out.length - 1);
    expect(parsed.grossAmountBtc).toBe(0.01745074);
  });
});
