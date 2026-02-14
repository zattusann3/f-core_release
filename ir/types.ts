// L1 IR types for f-core.
//
// Note: These types intentionally "close" the world for L1.
// Future versions should introduce new types (e.g. InstructionL2) rather than widening these.

export type NonEmptyArray<T> = [T, ...T[]];

// Semantic aliases (keep L1 simple; validation happens elsewhere)
export type SchemaVersion = 1;
export type EngineVersion = string; // SemVer string, validated at runtime
export type LabelName = string;

export type IR = {
  schemaVersion: SchemaVersion;
  engineVersion: EngineVersion;
  entry: "start";
  plugins: string[];
  labels: Record<LabelName, Instruction[]>;
};

// L1 instruction set (closed).
export type InstructionL1 = SayInstruction | ChoiceInstruction | EndInstruction;
export type Instruction = InstructionL1 | SetInstruction | IfInstruction | JumpInstruction | PluginInstruction;

// L2-1 instructions (flags + branching)
export type Value = boolean | number | string;

export type SetInstruction = {
  op: "set";
  name: string;
  value: Value;
};

export type IfInstruction = {
  op: "if";
  name: string;
  negated: boolean;
  to: LabelName;
  equals?: Value;
};

export type JumpInstruction = {
  op: "jump";
  to: LabelName;
};

export type PluginInstruction = {
  op: "plugin";
  name: string;
  attrs: Record<string, string>;
};

// L2 placeholder types (extend with new instruction unions later).
export type InstructionL2 =
  | InstructionL1
  | SetInstruction
  | IfInstruction
  | JumpInstruction
  | PluginInstruction;
export type IRL2 = Omit<IR, "labels"> & {
  labels: Record<LabelName, InstructionL2[]>;
};

export type SayInstruction = {
  op: "say";
  text: string;
  meta?: SayMeta;
};

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type SayMeta = { [key: string]: JsonValue };

export type ChoiceInstruction = {
  op: "choice";
  options: NonEmptyArray<ChoiceOption>;
};

export type ChoiceOption = {
  text: string;
  to: LabelName;
};

export type EndInstruction = {
  op: "end";
};
