import { LessDepth } from "../lib/threejs/src/constants.js";
import { epsilon, Mat4, Quat, Vec3, Vec4 } from "../lib/TSM.js";
import { AttributeLoader, MeshGeometryLoader, BoneLoader, MeshLoader } from "./AnimationFileLoader.js";

// EC trigger
// TIMEWARP = 0 | Default interpolation
// TIMEWARP = 1 | Ease-in-ease-out interpolation (Smooth start & end)
// TIMEWARP = 2 | Quadratic Ease-in interpolation (Slow start, fast end)
// TIMEWARP = 3 | Smootherstep (Cubic smoothing)
let TIMEWARP = 0;

//TODO: Generate cylinder geometry for highlighting bones
export class Cylinder {
  public axis: Vec3;
  public length: Vec3;
  public transform: Mat4;

  constructor(start: Vec3, end: Vec3) {
    this.axis = end.copy().subtract(start);
    this.axis.normalize();

    let arbitraryVec = Math.abs(this.axis.y) < 0.99 ? new Vec3([0, 1, 0]) : new Vec3([1, 0, 0]);
    let xAxis = Vec3.cross(arbitraryVec, this.axis);
    xAxis.normalize();

    let yAxis = Vec3.cross(this.axis, xAxis);
    yAxis.normalize();

    this.transform = new Mat4([
      xAxis.x, xAxis.y, xAxis.z, 0,
      yAxis.x, yAxis.y, yAxis.z, 0,
      this.axis.x, this.axis.y, this.axis.z, 0,
      start.x, start.y, start.z, 1
    ]);
  }

  public updatePositions(start: Vec3, end: Vec3) {
    this.axis = end.copy().subtract(start);
    this.axis.normalize();

    let arbitraryVec = Math.abs(this.axis.y) < 0.99 ? new Vec3([0, 1, 0]) : new Vec3([1, 0, 0]);
    let xAxis = Vec3.cross(arbitraryVec, this.axis);
    xAxis.normalize();

    let yAxis = Vec3.cross(this.axis, xAxis);
    yAxis.normalize();

    this.transform = new Mat4([
      xAxis.x, xAxis.y, xAxis.z, 0,
      yAxis.x, yAxis.y, yAxis.z, 0,
      this.axis.x, this.axis.y, this.axis.z, 0,
      start.x, start.y, start.z, 1
    ]);
  }
}

//General class for handling GLSL attributes
export class Attribute {
  values: Float32Array;
  count: number;
  itemSize: number;

  constructor(attr: AttributeLoader) {
    this.values = attr.values;
    this.count = attr.count;
    this.itemSize = attr.itemSize;
  }
}

//Class for handling mesh vertices and skin weights
export class MeshGeometry {
  position: Attribute;
  normal: Attribute;
  uv: Attribute | null;
  skinIndex: Attribute; // bones indices that affect each vertex
  skinWeight: Attribute; // weight of associated bone
  v0: Attribute; // position of each vertex of the mesh *in the coordinate system of bone skinIndex[0]'s joint*. Perhaps useful for LBS.
  v1: Attribute;
  v2: Attribute;
  v3: Attribute;

  constructor(mesh: MeshGeometryLoader) {
    this.position = new Attribute(mesh.position);
    this.normal = new Attribute(mesh.normal);
    if (mesh.uv) { this.uv = new Attribute(mesh.uv); }
    this.skinIndex = new Attribute(mesh.skinIndex);
    this.skinWeight = new Attribute(mesh.skinWeight);
    this.v0 = new Attribute(mesh.v0);
    this.v1 = new Attribute(mesh.v1);
    this.v2 = new Attribute(mesh.v2);
    this.v3 = new Attribute(mesh.v3);
  }
}

//Class for handling bones in the skeleton rig
export class Bone {
  public parent: number;
  public children: number[];
  public position: Vec3; // current position of the bone's joint *in world coordinates*. Used by the provided skeleton shader, so you need to keep this up to date.
  public endpoint: Vec3; // current position of the bone's second (non-joint) endpoint, in world coordinates
  public rotation: Quat; // current orientation of the joint *with respect to world coordinates*
  public cylinder: Cylinder; // cylinder for bone picking
  public endpointLocal: Vec3;
  public uMat: Mat4 | null;
  public rMat: Mat4;
  public tMat: Mat4;
  public localOffset: Vec3;
  public length: number;
  public fabrikStart: Vec3;
  public fabrikEnd: Vec3;

  constructor(bone: BoneLoader | Bone) {
    this.parent = bone.parent;
    this.children = Array.from(bone.children);
    this.position = bone.position.copy();
    this.endpoint = bone.endpoint.copy();
    this.rotation = bone.rotation.copy();
    this.cylinder = new Cylinder(this.position, this.endpoint);
    this.endpointLocal = this.endpoint.subtract(this.position, new Vec3());
    this.rMat = new Mat4().setIdentity();
    this.uMat = null;
    this.length = this.getLength();
    this.fabrikStart = this.position.copy();
    this.fabrikEnd = this.endpoint.copy();
  }

  public getLength(): number {
    return Vec3.distance(this.position, this.endpoint);
  }
}

//Class for handling the overall mesh and rig
export class Mesh {
  public geometry: MeshGeometry;
  public worldMatrix: Mat4; // in this project all meshes and rigs have been transformed into world coordinates for you
  public rotation: Vec3;
  public bones: Bone[];
  public materialName: string;
  public imgSrc: String | null;

  private boneIndices: number[];
  private bonePositions: Float32Array;
  private boneIndexAttribute: Float32Array;
  public highlighted: number;

  public keyFrameList: any[];
  public currentFrame: Bone[];
  public time: number = 0;
  public currentTime: number = 0;
  public playback: boolean = false;

  constructor(mesh: MeshLoader) {
    this.geometry = new MeshGeometry(mesh.geometry);
    this.worldMatrix = mesh.worldMatrix.copy();
    this.rotation = mesh.rotation.copy();
    this.bones = [];
    mesh.bones.forEach(bone => {
      this.bones.push(new Bone(bone));
    });
    for (let i = 0; i < this.bones.length; i++) {
      if (this.bones[i].parent != -1) {
        this.bones[i].localOffset = this.bones[i].position.subtract(this.bones[this.bones[i].parent].endpoint, new Vec3());
        if (this.bones[i].localOffset.length() < epsilon) {
          this.bones[i].localOffset = new Vec3([0, 0, 0]);
        }
      }
    }
    for (let i = 0; i < this.bones.length; i++) {
      this.bones[i].tMat = this.setTMatrix(this.bones[i], this.bones); 
    }
    for (let i = 0; i < this.bones.length; i++) {
      this.bones[i].uMat = this.setUMatrix(this.bones[i], this.bones);
    }
    this.materialName = mesh.materialName;
    this.imgSrc = null;
    this.boneIndices = Array.from(mesh.boneIndices);
    this.bonePositions = new Float32Array(mesh.bonePositions);
    this.boneIndexAttribute = new Float32Array(mesh.boneIndexAttribute);
    this.keyFrameList = [];
    this.currentFrame = [];
  }

  public getDMat(bone: Bone, boneList: Bone[]): Mat4 {
    let dMat;
    if (bone.parent == -1) {
      let T = new Mat4([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        bone.position.x, bone.position.y, bone.position.z, 1
      ]);
      dMat = T.multiply(bone.rMat, new Mat4());
    } else {
      dMat = this.getDMat(boneList[bone.parent], boneList)
          .multiply(bone.tMat, new Mat4())
          .multiply(bone.rMat, new Mat4());
      // dMat = bone.rMat
      //     .multiply(bone.tMat, new Mat4())
      //     .multiply(this.getDMat(this.bones[bone.parent]), new Mat4());
    }
    return dMat;
  }

  public setTMatrix(bone: Bone, boneList: Bone[]): Mat4 {
    let tMat;
    if (bone.parent == -1) {
      tMat = new Mat4().setIdentity();
    } else {
      // tMat = new Mat4([
      //   1, 0, 0, 0,
      //   0, 1, 0, 0,
      //   0, 0, 1, 0,
      //   this.bones[bone.parent].position.x - bone.position.x,
      //   this.bones[bone.parent].position.y - bone.position.y,
      //   this.bones[bone.parent].position.z - bone.position.z, 1
      // ]);
      tMat = new Mat4([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        bone.position.x - boneList[bone.parent].position.x,
        bone.position.y - boneList[bone.parent].position.y,
        bone.position.z - boneList[bone.parent].position.z, 1
      ]);
    }
    return tMat;
  }

  public setUMatrix(bone: Bone, boneList: Bone[]): Mat4 {
    let uMat;
    if (bone.parent == -1) {
      uMat = new Mat4([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        bone.position.x, bone.position.y, bone.position.z, 1
      ]);
    } else {
      if (boneList[bone.parent].uMat == null) boneList[bone.parent].uMat = this.setUMatrix(boneList[bone.parent], boneList);
      uMat = boneList[bone.parent].uMat!.multiply(bone.tMat, new Mat4());
    }
    return uMat;
  }

  //TODO: Create functionality for bone manipulation/key-framing
  public checkCollision(rayOrigin: Vec4, rayDirection: Vec4): number {
    let curr = -1;
    let closeT = Number.MAX_VALUE;
    for (let i = 0; i < this.bones.length; i++) {
      let { localOrigin, localDirection } = this.transformRay(rayOrigin, rayDirection, this.bones[i]);

      let x0 = localOrigin.x;
      let y0 = localOrigin.y;
      let x1 = localDirection.x;
      let y1 = localDirection.y;

      let a = x1 * x1 + y1 * y1;
      let b = 2.0 * (x0 * x1 + y0 * y1);
      let c = x0 * x0 + y0 * y0 - 0.1 * 0.1;

      if (0.0 == a) {
        // This implies that x1 = 0.0 and y1 = 0.0, which further
        // implies that the ray is aligned with the body of the
        // cylinder, so no intersection.
        continue;
      }

      let discriminant = b * b - 4.0 * a * c;

      if (discriminant < 0.0) {
        continue;
      }

      discriminant = Math.sqrt(discriminant);

      let t1 = (-b - discriminant) / (2.0 * a);
      let t2 = (-b + discriminant) / (2.0 * a);

      if (t1 > t2) [t1, t2] = [t2, t1];

      // Two intersections.
      let P = localOrigin.copy().add(localDirection.copy().scale(t1));
      let z = P.z;
      if (z >= 0.0 && z <= this.bones[i].getLength()) {
        // It's okay.
        if (t1 < closeT) {
          curr = i;
          closeT = t1;
          continue;
        }
      }

      P = localOrigin.copy().add(localDirection.copy().scale(t2));
      z = P.z;
      if (z >= 0.0 && z <= this.bones[i].getLength()) {
        if (t2 < closeT) {
          curr = i;
          closeT = t2;
          continue;
        }
      }
    }
    return curr;
  }

  public transformRay(rayOrigin: Vec4, rayDirection: Vec4, bone: Bone): { localOrigin: Vec4; localDirection: Vec4 } {
    let invTransform = new Mat4();
    bone.cylinder.transform.inverse(invTransform);

    let localOrigin = invTransform.multiplyVec4(rayOrigin);
    let localDirection = invTransform.multiplyVec4(rayDirection);
    localDirection.normalize();

    return { localOrigin, localDirection };
  }

  public getBoneIndices(): Uint32Array {
    return new Uint32Array(this.boneIndices);
  }

  public getBonePositions(): Float32Array {
    return this.bonePositions;
  }

  public getBoneIndexAttribute(): Float32Array {
    return this.boneIndexAttribute;
  }

  public getHighlighted(): number {
    return this.highlighted;
  }

  public getBoneTranslations(): Float32Array {
    if (this.playback) {
      this.calculateBoneInterpolation(this.keyFrameList);
      return this.getCurrentBoneTranslations(this.currentFrame);
    } else {
      return this.getCurrentBoneTranslations(this.bones);
    }
  }

  public getBoneRotations(): Float32Array {
    if (this.playback) {
      this.calculateBoneInterpolation(this.keyFrameList);
      return this.getCurrentBoneRotations(this.currentFrame);
    } else {
      return this.getCurrentBoneRotations(this.bones);
    }
  }

  public getCurrentBoneTranslations(bones): Float32Array {
    let trans = new Float32Array(3 * this.bones.length);
    bones.forEach((bone, index) => {
      let res = bone.position.xyz;
      for (let i = 0; i < res.length; i++) {
        trans[3 * index + i] = res[i];
      }
    });
    return trans;
  }

  public getCurrentBoneRotations(bones): Float32Array {
    let trans = new Float32Array(4 * this.bones.length);
    bones.forEach((bone, index) => {
      let res = bone.rotation.xyzw;
      for (let i = 0; i < res.length; i++) {
        trans[4 * index + i] = res[i];
      }
    });
    return trans;
  }

  public copyBones(boneList: Bone[]) {
    let newKeyFrame: Bone[] = [];
    boneList.forEach(bone => {
      let newBone = new Bone(bone);
      newBone.tMat = bone.tMat.copy();
      newBone.uMat = bone.uMat!.copy();
      newBone.rMat = bone.rMat.copy();
      if (bone.parent != -1) {
        newBone.localOffset = bone.localOffset.copy();
      }
      newBone.endpointLocal = bone.endpointLocal.copy();
      newKeyFrame.push(newBone);
    });
    return newKeyFrame;
  }

  public addKeyFrame(boneList: Bone[]) {
    let newKeyFrame: Bone[] = [];
    boneList.forEach(bone => {
      let newBone = new Bone(bone);
      newBone.tMat = bone.tMat.copy();
      newBone.uMat = bone.uMat!.copy();
      newBone.rMat = bone.rMat.copy();
      if (bone.parent != -1) {
        newBone.localOffset = bone.localOffset.copy();
      }
      newBone.endpointLocal = bone.endpointLocal.copy();
      newKeyFrame.push(newBone);
    });
    this.keyFrameList.push(newKeyFrame);
  }
  public replaceKeyFrame(boneList: Bone[], index: number) {
    let newKeyFrame: Bone[] = [];
    boneList.forEach(bone => {
      let newBone = new Bone(bone);
      newBone.tMat = bone.tMat.copy();
      newBone.uMat = bone.uMat!.copy();
      newBone.rMat = bone.rMat.copy();
      if (bone.parent != -1) {
        newBone.localOffset = bone.localOffset.copy();
      }
      newBone.endpointLocal = bone.endpointLocal.copy();
      newKeyFrame.push(newBone);
    });
    this.keyFrameList[index] = newKeyFrame;
  }

  public calculateBoneInterpolation(keyFrameList: any[]) {
    if (this.time == this.currentTime) {
      return;
    }
    let newBoneList: Bone[] = [];
    let frameStart = Math.floor(this.time);
    let frameEnd = frameStart + 1;
    let frameFraction = this.time - frameStart;

    for (let i = 0; i < this.bones.length; i++) {
      let startBone = keyFrameList[frameStart][i];
      let newBone = new Bone(startBone);
      newBone.endpointLocal = startBone.endpointLocal.copy();
      newBoneList.push(newBone);
    }

    for (let i = 0; i < this.bones.length; i++) {
      if (newBoneList[i].parent != -1) {
        newBoneList[i].localOffset = this.bones[i].localOffset.copy();
      }
    }

    for (let i = 0; i < this.bones.length; i++) {
      newBoneList[i].tMat = this.bones[i].tMat.copy();
    }

    for (let i = 0; i < this.bones.length; i++) {
      newBoneList[i].uMat = this.bones[i].uMat!.copy();
    }

    for (let i = 0; i < this.bones.length; i++) {
      let startBone: Bone = keyFrameList[frameStart][i];
      let endBone: Bone = keyFrameList[frameEnd][i];
      let newRot;
      let newTime;
      switch (TIMEWARP) {
        // Ease in ease out
        case 1:
          newTime = 3 * Math.pow(frameFraction, 2) - 2 * (Math.pow(frameFraction,3));
          newRot = Quat.slerpShort(startBone.rMat.copy().toMat3().toQuat(), endBone.rMat.copy().toMat3().toQuat(), newTime);
          break;

        // Quadratic Ease-in
        case 2:
          newTime = Math.pow(frameFraction, 2)
          newRot = Quat.slerpShort(startBone.rMat.copy().toMat3().toQuat(), endBone.rMat.copy().toMat3().toQuat(), newTime);
          break;

        // Smootherstep (Cubic Smoothing)
        case 3:
          newTime = 6 * Math.pow(frameFraction, 5) - 15 * (Math.pow(frameFraction, 4)) + 10 * Math.pow(frameFraction, 3);
          newRot = Quat.slerpShort(startBone.rMat.copy().toMat3().toQuat(), endBone.rMat.copy().toMat3().toQuat(), newTime);
          break;

        // Default
        case 0:
        default:
          newRot = Quat.slerpShort(startBone.rMat.copy().toMat3().toQuat(), endBone.rMat.copy().toMat3().toQuat(), frameFraction);
          break;
      }

      newBoneList[i].rMat.toMat3().toQuat();
      newBoneList[i].rMat = newRot.toMat4();
      newBoneList[i].rotation = this.getDMat(newBoneList[i], newBoneList).toMat3().toQuat();
      newBoneList[i].endpoint = this.getDMat(newBoneList[i], newBoneList).multiplyPt3(newBoneList[i].endpointLocal);
      for (let k = 0; k < newBoneList[i].children.length; k++) {
        let childBone = newBoneList[newBoneList[i].children[k]];
        childBone.position = newBoneList[i].endpoint.add(this.getDMat(newBoneList[i], newBoneList).multiplyVec3(childBone.localOffset), new Vec3);
        this.interpolateChildren(newBoneList[newBoneList[i].children[k]], newBoneList);
      }
    }
    this.currentFrame = newBoneList;
    this.currentTime = this.time;
  }

  private interpolateChildren(bone: Bone, boneList: Bone[]) {
    bone.rotation = this.getDMat(bone, boneList).toMat3().toQuat();
    bone.endpoint = this.getDMat(bone, boneList).multiplyPt3(bone.endpointLocal);

    for (let i = 0; i < bone.children.length; i++) {
      let childBone = boneList[bone.children[i]]
      childBone.position = bone.endpoint.add(this.getDMat(bone, boneList).multiplyVec3(childBone.localOffset), new Vec3);
      this.interpolateChildren(boneList[bone.children[i]], boneList);
    }
  }

  public rotateBoneOnAxis(p_angle: number, p_axis: Vec3, bone: Bone) {
    const axis = this.getDMat(bone, this.bones).inverse().multiplyVec3(p_axis).normalize();
    const quat = Quat.fromAxisAngle(axis, p_angle).normalize();

    bone.rMat = bone.rMat.multiply(quat.copy().toMat4());
    bone.rotation = this.getDMat(bone, this.bones).toMat3().toQuat();

    bone.endpoint = this.getDMat(bone, this.bones).multiplyPt3(bone.endpointLocal);

    // Rotate children
    for (let i = 0; i < bone.children.length; i++) {
      let childBone = this.bones[bone.children[i]];
      childBone.position = bone.endpoint.add(this.getDMat(bone, this.bones).multiplyVec3(childBone.localOffset), new Vec3);
      this.rotateChildBone(childBone);
      childBone.cylinder.updatePositions(childBone.position, childBone.endpoint);
    }
  }

  private rotateChildBone(bone: Bone) {
    bone.rotation = this.getDMat(bone, this.bones).toMat3().toQuat();
    bone.endpoint = this.getDMat(bone, this.bones).multiplyPt3(bone.endpointLocal);

    // Update children
    bone.children.forEach(childIndex => {
      let childBone = this.bones[childIndex];
      childBone.position = bone.endpoint.add(this.getDMat(bone, this.bones).multiplyVec3(childBone.localOffset), new Vec3);
      this.rotateChildBone(childBone);
      childBone.cylinder.updatePositions(childBone.position, childBone.endpoint);
    });
  }

  public rotateBone(p_angle: number, bone: Bone) {
    const axis = bone.endpointLocal;
    let angle = p_angle;
    const quat = Quat.fromAxisAngle(axis, angle).normalize();

    bone.rMat = bone.rMat.multiply(quat.copy().toMat4());
    bone.rotation = this.getDMat(bone, this.bones).toMat3().toQuat();

    // Rotate children
    for (let i = 0; i < bone.children.length; i++) {
      let childBone = this.bones[bone.children[i]];
      childBone.position = bone.endpoint.add(this.getDMat(bone, this.bones).multiplyVec3(childBone.localOffset), new Vec3);
      this.rotateChildBone(childBone);
      childBone.cylinder.updatePositions(childBone.position, childBone.endpoint);
    }
  }

  // IK STUFF
  public moveBone(distanceX: number, distanceY: number, bone: Bone, xAxis: Vec3, yAxis: Vec3, maxLength: number, base: Vec3) {
    let projected = bone.position.copy().add(xAxis.copy().scale(distanceX));
    projected.add(yAxis.copy().scale(distanceY));
    if (bone.parent != -1) {
      if (Math.abs(Vec3.distance(projected, base)) <= maxLength) {
        bone.position = projected;
      }
    } else {
      bone.position = projected;
    }
    
    bone.endpoint = this.getDMat(bone, this.bones).multiplyPt3(bone.endpointLocal);

    for (let i = 0; i < bone.children.length; i++) {
      let childBone = this.bones[bone.children[i]];
      childBone.position = bone.endpoint.add(this.getDMat(bone, this.bones).multiplyVec3(childBone.localOffset), new Vec3);
      this.moveChildBone(childBone);
      childBone.cylinder.updatePositions(childBone.position, childBone.endpoint);
    }
  }

  public moveChildBone(bone: Bone) {
    bone.endpoint = this.getDMat(bone, this.bones).multiplyPt3(bone.endpointLocal);

    for (let i = 0; i < bone.children.length; i++) {
      let childBone = this.bones[bone.children[i]];
      childBone.position = bone.endpoint.add(this.getDMat(bone, this.bones).multiplyVec3(childBone.localOffset), new Vec3);
      this.moveChildBone(childBone);
      childBone.cylinder.updatePositions(childBone.position, childBone.endpoint);
    }
  }

  // Forward pass
  public fabrikForward(boneChain: number[], endEffectorInit: Vec3, base: Vec3) {
    let endEffector = endEffectorInit;
    
    // Traverse bones in the chain, updating positions and rotations
    for (let i = 0; i < boneChain.length - 1; i++) {
      let currBone = this.bones[boneChain[i]];
      let parentBone = this.bones[boneChain[i + 1]];
      
      // Direction from current bone to target (end effector)
      let direction = parentBone.endpoint.copy().subtract(endEffector).normalize();
      
      // Update position and endpoint of the bone
      currBone.position = endEffector.copy();
      currBone.endpoint = endEffector.copy().add(direction.scale(currBone.length));

      // Move the end effector to the current bone's endpoint
      endEffector = currBone.endpoint.copy();
    }

    // Final bone update
    let direction = base.copy().subtract(endEffector).normalize();
    let currBone = this.bones[boneChain[boneChain.length - 1]];
    currBone.position = endEffector.copy();
    currBone.endpoint = endEffector.copy().add(direction.scale(currBone.length));
  }

  // Backward pass
  public fabrikBackward(boneChain: number[], endEffectorInit: Vec3, base: Vec3) {
    let endEffector = endEffectorInit;

    // Traverse bones in reverse order, updating positions and rotations
    for (let i = 0; i < boneChain.length - 1; i++) {
      let currBone = this.bones[boneChain[i]];
      let childBone = this.bones[boneChain[i + 1]];
      
      // Direction from current bone to target (end effector)
      let direction = childBone.endpoint.copy().subtract(endEffector).normalize();

      // Update position and endpoint of the bone
      currBone.position = endEffector.copy();
      currBone.endpoint = endEffector.copy().add(direction.scale(currBone.length));

      // Update rotation matrix based on new direction
      this.updateFrame(currBone, direction);

      // Move the end effector to the current bone's endpoint
      endEffector = currBone.endpoint.copy();
    }

    // Final bone update
    let direction = base.copy().subtract(endEffector).normalize();
    let currBone = this.bones[boneChain[boneChain.length - 1]];
    currBone.position = endEffector.copy();
    currBone.endpoint = endEffector.copy().add(direction.scale(currBone.length));
    this.updateFrame(currBone, direction);
  }

  // Update rotation based on the new direction
  public updateFrame(bone: Bone, direction: Vec3) {
    // Update endpoints
    bone.cylinder.updatePositions(bone.position, bone.endpoint);

    // Get the rest pose direction
    let restDirection = bone.endpointLocal.normalize();

    // Calculate the target direction from current position to endpoint
    let targetDirection = direction.normalize();
    const dot = Vec3.dot(restDirection, targetDirection);

    let rotationQuat: Quat;

    // Calculate rotation
    if (dot > 1.0 - epsilon) {
      rotationQuat = Quat.identity;
    } else if (dot < -1.0 + epsilon) {
      // If vectors are opposite, use 180-degree rotation around an orthogonal axis
      let ortho = Vec3.cross(new Vec3([1, 0, 0]), restDirection);
      if (ortho.length() < epsilon) {
        ortho = Vec3.cross(new Vec3([0, 1, 0]), restDirection);
      }
      ortho.normalize();
      rotationQuat = Quat.fromAxisAngle(ortho, Math.PI);
    } else {
      // General case: find the axis of rotation and angle
      const axis = Vec3.cross(restDirection, targetDirection).normalize();
      const angle = Math.acos(dot);
      rotationQuat = Quat.fromAxisAngle(axis, angle);
    }

    // Store rotation quaternion and build the rotation matrix
    bone.rotation = rotationQuat;
    if (bone.parent != -1) {
      const parentRot = this.getWorldRotation(this.bones[bone.parent]);
      const parentRotInv = parentRot.inverse();
      bone.rMat = parentRotInv.multiply(rotationQuat.toMat4());
    } else {
      bone.rMat = rotationQuat.toMat4();
    }
  }

  // Get the total rotation of a bone from parent's rMats
  public getWorldRotation(bone: Bone): Mat4 {
    if (bone.parent == -1) return bone.rMat.copy();
    return this.getWorldRotation(this.bones[bone.parent]).multiply(bone.rMat);
  }

  // Fix the RMat of the end effector bone because its rotation shouldn't have changed
  public fixRMat(bone: Bone) {
    const parentMat = this.getWorldRotation(this.bones[bone.parent]);
    const inverseParent = parentMat.inverse();
    bone.rMat = inverseParent;
  }
}