import { Camera } from "../lib/webglutils/Camera.js";
import { CanvasAnimation } from "../lib/webglutils/CanvasAnimation.js";
import { SkinningAnimation } from "./App.js";
import { Mat4, Vec3, Vec4, Vec2, Mat2, Quat } from "../lib/TSM.js";
import { Bone } from "./Scene.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";

/**
 * Might be useful for designing any animation GUI
 */
interface IGUI {
  viewMatrix(): Mat4;
  projMatrix(): Mat4;
  dragStart(me: MouseEvent): void;
  drag(me: MouseEvent): void;
  dragEnd(me: MouseEvent): void;
  onKeydown(ke: KeyboardEvent): void;
}

export enum Mode {
  playback,  
  edit  
}

	
/**
 * Handles Mouse and Button events along with
 * the the camera.
 */

export class GUI implements IGUI {
  private static readonly rotationSpeed: number = 0.05;
  private static readonly zoomSpeed: number = 0.1;
  private static readonly rollSpeed: number = 0.1;
  private static readonly panSpeed: number = 0.1;

  private camera: Camera;
  private dragging: boolean;
  private fps: boolean;
  private prevX: number;
  private prevY: number;

  private height: number;
  private viewPortHeight: number;
  private width: number;
  private viewPortWidth: number;

  private animation: SkinningAnimation;

  private selectedBone: number = -1;
  private boneDragging: boolean = false;
  private boneLock: number;

  public time: number;
  public mode: Mode;

  public hoverX: number = 0;
  public hoverY: number = 0;

  public createKeyFrame: boolean = false;
  public highlightedFrame: number = -1;
  public currentHighlightedFrame: number = -1;
  public clear: boolean = false;

  public move: boolean = false;


  /**
   *
   * @param canvas required to get the width and height of the canvas
   * @param animation required as a back pointer for some of the controls
   * @param sponge required for some of the controls
   */
  constructor(canvas: HTMLCanvasElement, animation: SkinningAnimation) {
    this.height = canvas.height;
    this.viewPortHeight = this.height - 200;
    this.width = canvas.width;
    this.viewPortWidth = this.width - 320;
    this.prevX = 0;
    this.prevY = 0;
    
    this.animation = animation;
    
    this.reset();
    
    this.registerEventListeners(canvas);
  }

  public removeFromArrayAtIndex<T>(array: T[], index: number): void {
    if (index >= 0 && index < array.length) {
      array.splice(index, 1);
    }
  }

  public getNumKeyFrames(): number {
    //TODO: Fix for the status bar in the GUI
    return this.animation.getScene().meshes[0].keyFrameList.length;
  }
  
  public getTime(): number { 
  	return this.time; 
  }
  
  public getMaxTime(): number { 
    //TODO: The animation should stop after the last keyframe
    return this.animation.getScene().meshes[0].keyFrameList.length - 1;
  }

  /**
   * Resets the state of the GUI
   */
  public reset(): void {
    this.fps = false;
    this.dragging = false;
    this.time = 0;
	this.mode = Mode.edit;
    
    this.camera = new Camera(
      new Vec3([0, 0, -6]),
      new Vec3([0, 0, 0]),
      new Vec3([0, 1, 0]),
      45,
      this.viewPortWidth / this.viewPortHeight,
      0.1,
      1000.0
    );
  }

  /**
   * Sets the GUI's camera to the given camera
   * @param cam a new camera
   */
  public setCamera(
    pos: Vec3,
    target: Vec3,
    upDir: Vec3,
    fov: number,
    aspect: number,
    zNear: number,
    zFar: number
  ) {
    this.camera = new Camera(pos, target, upDir, fov, aspect, zNear, zFar);
  }

  /**
   * Returns the view matrix of the camera
   */
  public viewMatrix(): Mat4 {
    return this.camera.viewMatrix();
  }

  /**
   * Returns the projection matrix of the camera
   */
  public projMatrix(): Mat4 {
    return this.camera.projMatrix();
  }

  /**
   * Callback function for the start of a drag event.
   * @param mouse
   */
  public dragStart(mouse: MouseEvent): void {
    this.checkHoverFrames(mouse.offsetX, mouse.offsetY);
    if (mouse.offsetY > 600 || mouse.offsetX > 800) {
      // outside the main panel
      return;
    }
    this.highlightedFrame = -1;

    // TODO: Add logic to rotate the bones, instead of moving the camera, if there is a currently highlighted bone
    if (this.selectedBone == -1) {
      this.dragging = true;
      this.boneDragging = false;
    } else {
      this.boneDragging = true;
      this.dragging = false;
    }
  
    this.prevX = mouse.screenX;
    this.prevY = mouse.screenY;
  }

  private checkHoverFrames(x: number, y: number): void {
    let hf = -1;
    if (x < 800 || y > 800) {
      hf = -1;
      return;
    }
    hf = Math.floor(y / 200);
    this.highlightedFrame = hf;
  }

  public incrementTime(dT: number): void {
    if (this.mode === Mode.playback) {
      this.time += dT;
      this.animation.getScene().meshes[0].time = this.time;
      if (this.time >= this.getMaxTime()) {
        this.time = 0;
        this.mode = Mode.edit;
        this.animation.getScene().meshes[0].playback = false;
      }
    }
  }
  

  /**
   * The callback function for a drag event.
   * This event happens after dragStart and
   * before dragEnd.
   * @param mouse
   */
  public drag(mouse: MouseEvent): void {
    let x = mouse.offsetX;
    let y = mouse.offsetY;
    if (this.dragging) {
      const dx = mouse.screenX - this.prevX;
      const dy = mouse.screenY - this.prevY;
      this.prevX = mouse.screenX;
      this.prevY = mouse.screenY;

      /* Left button, or primary button */
      const mouseDir: Vec3 = this.camera.right();
      mouseDir.scale(-dx);
      mouseDir.add(this.camera.up().scale(dy));
      mouseDir.normalize();

      if (dx === 0 && dy === 0) {
        return;
      }

      switch (mouse.buttons) {
        case 1: {
          let rotAxis: Vec3 = Vec3.cross(this.camera.forward(), mouseDir);
          rotAxis = rotAxis.normalize();

          if (this.fps) {
            this.camera.rotate(rotAxis, GUI.rotationSpeed);
          } else {
            this.camera.orbitTarget(rotAxis, GUI.rotationSpeed);
          }
          break;
        }
        case 2: {
          /* Right button, or secondary button */
          this.camera.offsetDist(Math.sign(mouseDir.y) * GUI.zoomSpeed);
          break;
        }
        default: {
          break;
        }
      }
    }
    // TODO: Add logic here:
    if (this.boneDragging == false) {
      // 1) To highlight a bone, if the mouse is hovering over a bone;
      let ndcx = ((2 * x) / this.viewPortWidth) - 1;
      let ndcy = 1 - ((2 * y) / this.viewPortHeight);
      let end = new Vec4([ndcx, ndcy, 1, 1]);

      // Setup ray end point
      end = this.projMatrix().inverse().multiplyVec4(end);
      end.x = end.x / end.w;
      end.y = end.y / end.w;
      end.z = end.z / end.w;
      end.w = end.w / end.w; 
      end = this.viewMatrix().inverse().multiplyVec4(end);

      // Calculate direction vector from origin to endpoint
      let origin = new Vec4([this.camera.pos().x, this.camera.pos().y, this.camera.pos().z, 1]);
      let direction = end.copy().subtract(origin);
      this.selectedBone = this.animation.getScene().meshes[0].checkCollision(origin, direction);
      this.animation.getScene().meshes[0].highlighted = this.selectedBone;
      
      // 2) To rotate a bone, if the mouse button is pressed and currently highlighting a bone.
    } else {
      if (this.selectedBone != -1) {
        const dx = mouse.screenX - this.prevX;
        const dy = mouse.screenY - this.prevY;
        this.prevX = mouse.screenX;
        this.prevY = mouse.screenY;
        const boneList = this.animation.getScene().meshes[0].bones;
        const bone = this.animation.getScene().meshes[0].bones[this.selectedBone]
        
        if (this.move) {
          this.animation.getScene().meshes[0].moveBone(dx * 0.01, -1 * dy * 0.01, bone, this.camera.right(), this.camera.up());
          let subBase = bone.parent;
          let found = false;
          while (subBase != 0 && !found) {
            if (boneList[subBase].children.length > 1) {
              found = true;
            } else {
              subBase = boneList[subBase].parent;
            }
          }
          // this.animation.getScene().meshes[0].fabrik(bone.position, this.selectedBone, boneList[subBase].position, boneList[bone.parent]);
        } else {
          this.animation.getScene().meshes[0].rotateBoneOnAxis(GUI.rotationSpeed * -dx, this.camera.forward(), bone);
          this.animation.getScene().meshes[0].rotateBoneOnAxis(GUI.rotationSpeed * dy, this.camera.forward(), bone);
        }
        bone.cylinder.updatePositions(bone.position, bone.endpoint);
      }
    }
  }
  
 
  public getModeString(): string {
    switch (this.mode) {
      case Mode.edit: { return "edit: " + this.getNumKeyFrames() + " keyframes"; }
      case Mode.playback: { return "playback: " + this.getTime().toFixed(2) + " / " + this.getMaxTime().toFixed(2); }
    }
  }
  
  /**
   * Callback function for the end of a drag event
   * @param mouse
   */
  public dragEnd(mouse: MouseEvent): void {
    this.dragging = false;
    this.prevX = 0;
    this.prevY = 0;
	
    // TODO: Handle ending highlight/dragging logic as needed
    this.boneDragging = false;
  
  }

  /**
   * Callback function for a key press event
   * @param key
   */
  public onKeydown(key: KeyboardEvent): void {
    switch (key.code) {
      case "Digit1": {
        this.animation.setScene("./static/assets/skinning/split_cube.dae");
        break;
      }
      case "Digit2": {
        this.animation.setScene("./static/assets/skinning/long_cubes.dae");
        break;
      }
      case "Digit3": {
        this.animation.setScene("./static/assets/skinning/simple_art.dae");
        break;
      }      
      case "Digit4": {
        this.animation.setScene("./static/assets/skinning/mapped_cube.dae");
        // this.animation.loadTexture("./static/assets/skinning/minecraft_tree_wood.jpg");
        break;
      }
      case "Digit5": {
        this.animation.setScene("./static/assets/skinning/robot.dae");
        break;
      }
      case "Digit6": {
        this.animation.setScene("./static/assets/skinning/head.dae");
        break;
      }
      case "Digit7": {
        this.animation.setScene("./static/assets/skinning/wolf.dae");
        break;
      }
      case "Digit8": {
        this.animation.setScene("./static/assets/skinning/prince2.dae");
        break;
      }
      case "KeyW": {
        this.camera.offset(
            this.camera.forward().negate(),
            GUI.zoomSpeed,
            true
          );
        break;
      }
      case "KeyA": {
        this.camera.offset(this.camera.right().negate(), GUI.zoomSpeed, true);
        break;
      }
      case "KeyS": {
        this.camera.offset(this.camera.forward(), GUI.zoomSpeed, true);
        break;
      }
      case "KeyD": {
        this.camera.offset(this.camera.right(), GUI.zoomSpeed, true);
        break;
      }
      case "KeyR": {
        this.clear = true;
        this.animation.reset();
        this.animation.getScene().meshes[0].keyFrameList.length = 0;
        this.highlightedFrame = -1;
        break;
      }
      case "ArrowLeft": {
        //TODO: Handle bone rolls when a bone is selected
        if (this.selectedBone != -1) {
          const bone = this.animation.getScene().meshes[0].bones[this.selectedBone];
          this.animation.getScene().meshes[0].rotateBone(GUI.rollSpeed, bone);
        } else {
          this.camera.roll(GUI.rollSpeed, false);
        }
        break;
      }
      case "ArrowRight": {
        //TODO: Handle bone rolls when a bone is selected
        if (this.selectedBone != -1) {
          const bone = this.animation.getScene().meshes[0].bones[this.selectedBone];
          this.animation.getScene().meshes[0].rotateBone(-1 * GUI.rollSpeed, bone);
        } else {
          this.camera.roll(GUI.rollSpeed, true);
        }
        break;
      }
      case "ArrowUp": {
        this.camera.offset(this.camera.up(), GUI.zoomSpeed, true);
        break;
      }
      case "ArrowDown": {
        this.camera.offset(this.camera.up().negate(), GUI.zoomSpeed, true);
        break;
      }
      case "KeyK": {
        this.highlightedFrame = -1;
        if (this.mode === Mode.edit) {
		      //TODO: Add keyframes if required by project spec
          this.animation.getScene().meshes[0].addKeyFrame(this.animation.getScene().meshes[0].bones);
          this.createKeyFrame = true;
        }
        break;
      }      
      case "KeyP": {
        this.highlightedFrame = -1;
        if (this.mode === Mode.edit && this.getNumKeyFrames() > 1)
        {
          this.mode = Mode.playback;
          this.animation.getScene().meshes[0].playback = true;
          this.time = 0;
        } else if (this.mode === Mode.playback) {
          this.mode = Mode.edit;
          this.animation.getScene().meshes[0].playback = false;
        }
        break;
      }
      case "KeyU": {
        if (this.mode === Mode.edit && this.highlightedFrame != -1) {
          this.animation.getScene().meshes[0].replaceKeyFrame(this.animation.getScene().meshes[0].bones, this.highlightedFrame);
          this.createKeyFrame = true;
        }
        break;
      }
      case "Delete": {
        if (this.mode === Mode.edit && this.highlightedFrame != -1) {
          this.removeFromArrayAtIndex(this.animation.getScene().meshes[0].keyFrameList, this.highlightedFrame);
          this.removeFromArrayAtIndex(this.animation.renderTexture, this.highlightedFrame);
        }
        break;
      }
      case "Equal": {
        if (this.mode === Mode.edit && this.highlightedFrame != -1) {
          let boneCopy = this.animation.getScene().meshes[0].copyBones(this.animation.getScene().meshes[0].keyFrameList[this.highlightedFrame]);
          this.animation.getScene().meshes[0].bones = boneCopy;
        }
        break;
      }
      case "ControlLeft": {
        if (this.move == false) {
          this.move = true;
          console.log("Move");
        } else {
          this.move = false;
          console.log("Rotate");
        }
        break;
      }
      default: {
        console.log("Key : '", key.code, "' was pressed.");
        break;
      }
    }
  }

  /**
   * Registers all event listeners for the GUI
   * @param canvas The canvas being used
   */
  private registerEventListeners(canvas: HTMLCanvasElement): void {
    /* Event listener for key controls */
    window.addEventListener("keydown", (key: KeyboardEvent) =>
      this.onKeydown(key)
    );

    /* Event listener for mouse controls */
    canvas.addEventListener("mousedown", (mouse: MouseEvent) =>
      this.dragStart(mouse)
    );

    canvas.addEventListener("mousemove", (mouse: MouseEvent) =>
      this.drag(mouse)
    );

    canvas.addEventListener("mouseup", (mouse: MouseEvent) =>
      this.dragEnd(mouse)
    );

    /* Event listener to stop the right click menu */
    canvas.addEventListener("contextmenu", (event: any) =>
      event.preventDefault()
    );
  }
}
