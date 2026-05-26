import { Command } from "commander";
import { Note } from "@/utils/note.js";
import { formatUnits } from "@/utils/amount.js";
import { SOL_DECIMALS } from "@/cli/helpers.js";

export function registerNoteCommands(program: Command): void {
  const noteCommand = new Command("note")
    .enablePositionalOptions()
    .description("Generate notes");

  noteCommand
    .command("gen <amount>")
    .description("Generate a note; amount uses UI units such as 1 for 1 SOL")
    .action(async (amount: string) => {
      try {
        const note = await Note.generate(amount);
        console.log("Note generated:", {
          note: note.serialize(),
          commitment: note.commitment,
        });
      } catch (error) {
        console.error("Generate note failed:", error);
        process.exit(1);
      }
    });

  noteCommand
    .command("verify <note> <commitment>")
    .description("Verify a note")
    .action(async (note_str, commitment) => {
      try {
        const note = await Note.deserialize(note_str);
        const valid = await note.verify(commitment);

        if (!valid) {
          console.error("Note is invalid");
          process.exit(1);
        }

        console.log("Note verification passed");
        console.log("Note details:", {
          amount: note.amount,
          amountInSol: formatUnits(note.amountRaw, SOL_DECIMALS),
          commitment: note.commitment,
          nullifierHash: note.nullifierHash,
        });
      } catch (error) {
        console.error("Note verify failed:", error);
        process.exit(1);
      }
    });

  program.addCommand(noteCommand);
}
