export const floorVSText = `
    precision mediump float;

    uniform vec4 uLightPos;
    uniform mat4 uWorld;
    uniform mat4 uView;
    uniform mat4 uProj;
    
    attribute vec4 aVertPos;

    varying vec4 vClipPos;

    void main () {

        gl_Position = uProj * uView * uWorld * aVertPos;
        vClipPos = gl_Position;
    }
`;

export const floorFSText = `
    precision mediump float;

    uniform mat4 uViewInv;
    uniform mat4 uProjInv;
    uniform vec4 uLightPos;

    varying vec4 vClipPos;

    void main() {
        vec4 wsPos = uViewInv * uProjInv * vec4(vClipPos.xyz/vClipPos.w, 1.0);
        wsPos /= wsPos.w;
        /* Determine which color square the position is in */
        float checkerWidth = 5.0;
        float i = floor(wsPos.x / checkerWidth);
        float j = floor(wsPos.z / checkerWidth);
        vec3 color = mod(i + j, 2.0) * vec3(1.0, 1.0, 1.0);

        /* Compute light fall off */
        vec4 lightDirection = uLightPos - wsPos;
        float dot_nl = dot(normalize(lightDirection), vec4(0.0, 1.0, 0.0, 0.0));
	    dot_nl = clamp(dot_nl, 0.0, 1.0);
	
        gl_FragColor = vec4(clamp(dot_nl * color, 0.0, 1.0), 1.0);
    }
`;

export const sceneVSText = `
    precision mediump float;

    attribute vec3 vertPosition;
	
    attribute vec2 aUV;
    attribute vec3 aNorm;
    attribute vec4 skinIndices;
    attribute vec4 skinWeights;
	
	//vertices used for bone weights (assumes up to four weights per vertex)
    attribute vec4 v0;
    attribute vec4 v1;
    attribute vec4 v2;
    attribute vec4 v3;
    
    varying vec4 lightDir;
    varying vec2 uv;
    varying vec4 normal;
 
    uniform vec4 lightPosition;
    uniform mat4 mWorld;
    uniform mat4 mView;
    uniform mat4 mProj;

	//Joint translations and rotations to determine weights (assumes up to 64 joints per rig)
    uniform vec3 jTrans[64];
    uniform vec4 jRots[64];

    uniform mat4 uLightSpaceMatrix;
    varying vec4 vPositionFromLight;

    vec3 qtrans(vec4 q, vec3 v) {
        return v + 2.0 * cross(cross(v, q.xyz) - q.w*v, q.xyz);
    }

    void main () {
	
        vec4 skinned_position = vec4(0.0);
        vec4 skinned_normal = vec4(0.0);

        for (int i = 0; i < 4; i++) {
            int joint_index = int(skinIndices[i]);
            float weight = skinWeights[i];

            vec4 v;
            if (i == 0) v = v0;
            else if (i == 1) v = v1;
            else if (i == 2) v = v2;
            else v = v3;

            vec3 joint_trans = jTrans[joint_index];
            vec4 joint_rot = jRots[joint_index];

            vec3 transformed_v = joint_trans + qtrans(joint_rot, v.xyz);
            skinned_position += weight * vec4(transformed_v, 1.0);

            vec3 transformed_normal = qtrans(joint_rot, aNorm);
            skinned_normal += weight * vec4(transformed_normal, 0.0);
        }

        gl_Position = mProj * mView * mWorld * skinned_position;
        
        lightDir = lightPosition - skinned_position;
        
        normal = normalize(mWorld * skinned_normal);
        
        uv = aUV;

        vPositionFromLight = uLightSpaceMatrix * skinned_position;
    }

`;

export const sceneFSText = `
    precision mediump float;

    varying vec4 lightDir;
    varying vec2 uv;
    varying vec4 normal;

    void main () {
        gl_FragColor = vec4((normal.x + 1.0)/2.0, (normal.y + 1.0)/2.0, (normal.z + 1.0)/2.0,1.0);
    }
`;



export const skeletonVSText = `
    precision mediump float;

    attribute vec3 vertPosition;
    attribute float boneIndex;
    
    uniform mat4 mWorld;
    uniform mat4 mView;
    uniform mat4 mProj;
    uniform float highlighted;

    uniform vec3 bTrans[64];
    uniform vec4 bRots[64];

    varying float vBoneIndex;

    vec3 qtrans(vec4 q, vec3 v) {
        return v + 2.0 * cross(cross(v, q.xyz) - q.w*v, q.xyz);
    }

    void main () {
        int index = int(boneIndex);
        gl_Position = mProj * mView * mWorld * vec4(bTrans[index] + qtrans(bRots[index], vertPosition), 1.0);
        vBoneIndex = boneIndex;
    }
`;

export const skeletonFSText = `
    precision mediump float;
    uniform float highlighted;
    varying float vBoneIndex;

    void main () {
        if (abs(vBoneIndex - highlighted) < 0.0001) {
            gl_FragColor = vec4(0.0, 1.0, 1.0, 1.0);
        } else {
            gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
        }
    }
`;

	
export const sBackVSText = `
    precision mediump float;

    attribute vec2 vertPosition;

    varying vec2 uv;

    void main() {
        gl_Position = vec4(vertPosition, 0.0, 1.0);
        uv = vertPosition;
        uv.x = (1.0 + uv.x) / 2.0;
        uv.y = (1.0 + uv.y) / 2.0;
    }
`;

export const sBackFSText = `
    precision mediump float;

    varying vec2 uv;

    void main () {
        gl_FragColor = vec4(0.1, 0.1, 0.1, 1.0);
        if (abs(uv.y-.33) < .005 || abs(uv.y-.67) < .005) {
            gl_FragColor = vec4(1, 1, 1, 1);
        }
    }

`;

export const textureMapVSText = `
    attribute vec3 vertPosition;
    attribute vec2 aUV;

    varying vec2 vUv;

    uniform mat4 mProj;
    uniform mat4 mView;

    void main() {
        vUv = aUV;
        gl_Position = mProj * mView * vec4(vertPosition, 1.0);
    }
`;

export const textureMapFSText = `
    precision mediump float;

    uniform sampler2D uTexture;
    varying vec2 vUv;

    void main() {
        gl_FragColor = texture2D(uTexture, vUv);
    }

`;