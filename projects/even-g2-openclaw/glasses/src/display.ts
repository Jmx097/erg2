import {
  CreateStartUpPageContainer,
  type EvenAppBridge,
  StartUpPageCreateResult,
  TextContainerProperty,
  TextContainerUpgrade
} from "@evenrealities/even_hub_sdk";

const MAIN_TEXT_ID = 1;
const MAIN_TEXT_NAME = "main";
const MAX_GLASS_TEXT = 950;

type LegacyCreateStartUpPageContainer = (
  containerTotalNum: number,
  textObject: TextContainerProperty[]
) => Promise<StartUpPageCreateResult>;

export class DisplayController {
  private created = false;

  constructor(private readonly bridge: EvenAppBridge) {}

  async create(initialText: string): Promise<void> {
    const textContainer = buildMainTextContainer(initialText);
    let result = await this.bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({
        containerTotalNum: 1,
        textObject: [textContainer]
      })
    );

    if (result !== StartUpPageCreateResult.success) {
      const legacyCreate = this.bridge.createStartUpPageContainer.bind(this.bridge) as unknown as LegacyCreateStartUpPageContainer;
      result = await legacyCreate(1, [textContainer]);
    }

    if (result !== StartUpPageCreateResult.success) {
      throw new Error(`Unable to create G2 text container: ${result}`);
    }

    this.created = true;
  }

  async render(text: string): Promise<void> {
    const content = clampGlassText(text);

    if (!this.created) {
      await this.create(content);
      return;
    }

    await this.bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: MAIN_TEXT_ID,
        containerName: MAIN_TEXT_NAME,
        contentOffset: 0,
        contentLength: content.length,
        content
      })
    );
  }
}

export function clampGlassText(text: string): string {
  const normalized = text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (normalized.length <= MAX_GLASS_TEXT) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_GLASS_TEXT - 3)}...`;
}

function buildMainTextContainer(text: string): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 288,
    borderWidth: 0,
    borderColor: 5,
    borderRadius: 0,
    paddingLength: 4,
    containerID: MAIN_TEXT_ID,
    containerName: MAIN_TEXT_NAME,
    isEventCapture: 1,
    content: clampGlassText(text)
  });
}
