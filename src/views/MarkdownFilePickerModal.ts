import { App, FuzzySuggestModal, TFile } from "obsidian";

export class MarkdownFilePickerModal extends FuzzySuggestModal<TFile> {
    private files: TFile[];
    private resolve: ((file: TFile) => void) | null = null;

    constructor(app: App, files: TFile[]) {
        super(app);
        this.files = files;
        this.setPlaceholder("Type to search for a markdown file...");
    }

    getItems(): TFile[] {
        return this.files;
    }

    getItemText(file: TFile): string {
        return file.path;
    }

    onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent): void {
        if (this.resolve) {
            this.resolve(file);
        }
    }

    /**
     * Open the modal and return a promise that resolves with the selected file
     */
    openAndGetFile(): Promise<TFile> {
        return new Promise((resolve) => {
            this.resolve = resolve;
            this.open();
        });
    }
}
